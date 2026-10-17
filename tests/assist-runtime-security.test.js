import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { trustedRequest, installAssistRoute } from "../assist/transport.js";
import { fileReaders } from "../assist/file-adapter.js";
import { AssistRuntime } from "../assist/runtime.js";

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const encode = text => new TextEncoder().encode(text);
function request(body = { action: "state", sessionId: "a" }, changes = {}) {
  const { headers = {}, remoteAddress = "127.0.0.1", raw, ...rest } = changes;
  const req = Readable.from([Buffer.from(raw ?? JSON.stringify(body))]);
  req.method = "POST"; req.socket = { remoteAddress };
  req.headers = { host: "127.0.0.1:59595", origin: "http://127.0.0.1:59595", cookie: "dsh-session=offline-test", "content-type": "application/json", ...headers };
  return Object.assign(req, rest);
}
function response() {
  return Object.assign(new EventEmitter(), { destroyed: false, writableEnded: false, status: null, headers: null, body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers; },
    end(body) { this.body = JSON.parse(body); this.writableEnded = true; },
  });
}
function routeFixture() {
  let route;
  const calls = [];
  const ctx = { effect: start => start(), connection: { requestRejection({ headers }) { return headers.cookie === "dsh-session=offline-test" ? undefined : "unauthorized"; } },
    webServer: { register(value) { route = value; return () => {}; } } };
  const service = {
    async dispatch(input, options) { calls.push({ input, options }); return { state: "offline" }; },
    errorCode: error => AssistRuntime.prototype.errorCode.call(null, error),
  };
  installAssistRoute(ctx, service);
  return { ctx, service, calls, handler: (req, res) => route.handler(req, res), route };
}

test("loopback, authenticated cookie and exact Origin/Host are all required", () => {
  const f = routeFixture();
  for (const remoteAddress of ["127.0.0.1", "127.1.2.3", "::1", "::ffff:127.0.0.1"]) {
    assert.equal(trustedRequest(f.ctx, request(undefined, { remoteAddress })), true);
  }
  for (const changes of [{ remoteAddress: "192.168.0.2" }, { remoteAddress: "8.8.8.8" }, { remoteAddress: "127.0.0.1.attacker" },
    { headers: { cookie: undefined } }, { headers: { cookie: "wrong" } }, { headers: { origin: undefined } },
    { headers: { origin: "http://attacker.example" } }, { headers: { origin: "http://localhost:59595" } },
    { headers: { origin: "file://127.0.0.1:59595" } }, { headers: { origin: ["http://127.0.0.1:59595"] } }]) {
    assert.equal(trustedRequest(f.ctx, request(undefined, changes)), false, JSON.stringify(changes));
  }
});

test("authenticated JSON POST alone grants fromUI with no-store response and removes close listener", async () => {
  const f = routeFixture(), req = request(undefined, { headers: { "content-type": "application/json; charset=utf-8" } }), res = response();
  await f.handler(req, res); assert.equal(res.status, 200); assert.deepEqual(res.body, { ok: true, value: { state: "offline" } });
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].options.fromUI, true);
  assert.ok(f.calls[0].options.signal instanceof AbortSignal);
  assert.equal(res.headers["Cache-Control"], "no-store"); assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(res.listenerCount("close"), 0); assert.equal(f.route.path, "/local-openai-fast/assist-v2");
});

test("HTTP rejects untrusted methods, invalid JSON MIME, oversized/malformed bodies and sanitizes upstream errors", async () => {
  for (const [changes, status, code] of [
    [{ method: "GET" }, 403, "forbidden"], [{ headers: { cookie: "bad" } }, 403, "forbidden"],
    [{ headers: { origin: "https://attacker.example" } }, 403, "forbidden"],
    [{ headers: { "content-type": "text/plain" } }, 415, "invalid-request"],
    [{ headers: { "content-type": "application/jsonp" } }, 415, "invalid-request"],
    [{ raw: "{" }, 400, "invalid-request"], [{ raw: "x".repeat(393217) }, 400, "request-too-large"],
  ]) {
    const f = routeFixture(), res = response(); await f.handler(request(undefined, changes), res);
    assert.equal(res.status, status); assert.deepEqual(res.body, { ok: false, error: { code } }); assert.equal(f.calls.length, 0);
  }
  const f = routeFixture(), res = response();
  f.service.dispatch = async () => { throw new Error("RAW_SECRET_PROVIDER_BODY"); };
  await f.handler(request(), res); assert.deepEqual(res.body, { ok: false, error: { code: "model-failed" } });
  assert.doesNotMatch(JSON.stringify(res.body), /RAW_SECRET/);
});

test("disconnect aborts the auxiliary request and disposes the close listener", { timeout: 3000 }, async () => {
  const f = routeFixture(), ready = deferred(), res = response(); let signal;
  f.service.dispatch = async (_input, options) => {
    signal = options.signal; ready.resolve();
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  };
  const work = f.handler(request(), res); await ready.promise;
  res.destroyed = true; res.emit("close"); await work;
  assert.equal(signal.aborted, true); assert.equal(res.body, null); assert.equal(res.listenerCount("close"), 0);
});

test("file adapter uses agent-scoped fs and validates canonical sensitive/binary targets before reading", async () => {
  const agent = { id: "a", session: {} }, signal = new AbortController().signal;
  let canonical = "/workspace/actual.txt", type = "file", size = 4, reads = 0, resolves = 0, hostReads = 0;
  const target = Object.freeze({ targetKey: "opaque-target", displayPath: "not-an-authority" });
  const scoped = {
    async resolve(path, options) { resolves++; assert.equal(path, "alias.txt"); assert.equal(options.cwd, "/workspace"); assert.strictEqual(options.signal, signal); return target; },
    processPath(actual) { assert.strictEqual(actual, target); return canonical; },
    stat: async () => ({ type, size }),
    async readBytes(actual, actualSignal, maxBytes) { reads++; assert.strictEqual(actual, target); assert.strictEqual(actualSignal, signal); assert.equal(maxBytes, 5); return encode("data"); },
  };
  const ctx = { get: name => name === "agentPresets" ? { serviceFor(actualAgent, name) { assert.strictEqual(actualAgent, agent); assert.equal(name, "fs"); return scoped; } } : undefined,
    workingDirectory: { get: () => "/workspace" }, fs: { readBytes: () => { hostReads++; throw new Error("raw host forbidden"); } } };
  const readers = fileReaders(ctx, agent);
  assert.equal(new TextDecoder().decode(await readers.readBytes("alias.txt", signal, 5)), "data");
  for (const [path, code] of [["/workspace/.env", "sensitive-file"], ["/workspace/passwords.csv", "sensitive-file"],
    ["/workspace/.npmrc", "sensitive-file"], ["/workspace/image.png", "unsupported-file"]]) {
    canonical = path; await assert.rejects(readers.readBytes("alias.txt", signal, 5), { code });
  }
  canonical = "/workspace/actual.txt"; type = "directory";
  await assert.rejects(readers.readBytes("alias.txt", signal, 5), { code: "not-a-file" });
  type = "file"; size = 6; await assert.rejects(readers.readBytes("alias.txt", signal, 5), { code: "file-too-large" });
  assert.equal(reads, 1); assert.equal(hostReads, 0); assert.equal(resolves, 7);
});

test("receipts require exact session ownership, real-name policy and actual stream byte bound", async () => {
  const agent = { id: "a", session: {} }; let reads = 0, name = "real.txt", bytes = 4, chunks = [encode("data")];
  const ctx = { get: () => undefined, fs: {}, workingDirectory: { get: () => "/workspace" },
    fileUploads: { resolve(actualAgent, id) { assert.strictEqual(actualAgent, agent); return id === "owned" ? { name, bytes } : undefined; } },
    attachments: { async *readFileStream() { reads++; yield* chunks; } },
  };
  const readers = fileReaders(ctx, agent), signal = new AbortController().signal;
  await assert.rejects(readers.readReceipt("other-session", signal, 5), { code: "invalid-receipt" });
  for (const [actualName, code] of [["passwords.csv", "sensitive-file"], [".npmrc", "sensitive-file"], ["picture.png", "unsupported-file"]]) {
    name = actualName; await assert.rejects(readers.readReceipt("owned", signal, 5), { code });
  }
  assert.equal(reads, 0); name = "real.txt"; bytes = 6;
  await assert.rejects(readers.readReceipt("owned", signal, 5), { code: "file-too-large" });
  assert.equal(reads, 0); bytes = 4; chunks = [encode("abc"), encode("def")];
  await assert.rejects(readers.readReceipt("owned", signal, 5), { code: "file-too-large" });
  chunks = [encode("data")]; assert.equal(new TextDecoder().decode(await readers.readReceipt("owned", signal, 5)), "data");
});
