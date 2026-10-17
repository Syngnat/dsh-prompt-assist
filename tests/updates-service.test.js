import test from "node:test";
import assert from "node:assert/strict";
import { UpdateService, RELEASE_API, INSTALL_SPEC, CHECK_TIMEOUT_MS, CHECK_COOLDOWN_MS, MAX_RESPONSE_BYTES } from "../updates/service.js";

const encode = value => new TextEncoder().encode(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const release = (tag = "v1.3.0", changes = {}) => ({ draft: false, prerelease: false, tag_name: tag, html_url: `https://github.com/Syngnat/dsh-prompt-assist/releases/tag/${tag}`, ...changes });
const json = (value, options = {}) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" }, ...options });
function fixture(t, options = {}) {
  let now = 0, count = 0; const calls = [], timers = new Map(); let timerId = 0;
  const fetcher = options.fetch ?? (async () => json(release()));
  const service = new UpdateService({ currentVersion: "1.2.8", clock: () => now,
    setTimer(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimer(id) { timers.delete(id); },
    ...options, fetch: async (...args) => { count++; calls.push(args); return fetcher(...args); },
  });

  t.after(() => service.dispose());
  return { service, calls, timers, get count() { return count; }, setTime(value) { now = value; }, fire() { const timer = [...timers.values()][0]; assert.ok(timer); timer.fn(); } };
}
function streamBody(chunks) {
  let index = 0, cancelled = 0, pulls = 0;
  const body = new ReadableStream({
    pull(controller) { pulls++; if (index < chunks.length) controller.enqueue(chunks[index++]); else controller.close(); },
    cancel() { cancelled++; },
  }, { highWaterMark: 0 });
  return { body, get cancelled() { return cancelled; }, get pulls() { return pulls; } };
}

test("constructing and reading status is offline and returns only immutable shared contract fields", t => {
  const f = fixture(t);
  const expected = { currentVersion: "1.2.8", status: "idle", latestVersion: null, releaseUrl: null, checkedAt: null, error: null, installSpec: INSTALL_SPEC };
  assert.deepEqual(f.service.status(), expected); assert.deepEqual(f.service.status(), expected);
  assert.notStrictEqual(f.service.status(), f.service.status()); assert.ok(Object.isFrozen(f.service.status()));
  assert.equal(f.count, 0); assert.equal(f.timers.size, 0);
});

test("stable SemVer comparison handles update, equal, ahead and numeric rather than lexical order", async t => {
  for (const [currentVersion, tag, status, latestVersion] of [["1.2.8", "v1.3.0", "update-available", "1.3.0"],
    ["1.2.8", "1.2.8", "current", "1.2.8"], ["1.3.0", "v1.2.8", "ahead", "1.2.8"],
    ["1.9.0", "v1.10.0", "update-available", "1.10.0"], ["1.3.0-beta.1", "v1.3.0", "update-available", "1.3.0"]]) {
    const f = fixture(t, { currentVersion, fetch: async () => json(release(tag)) });
    const value = await f.service.check(); assert.equal(value.status, status); assert.equal(value.latestVersion, latestVersion);
    assert.equal(value.error, null); assert.equal(value.checkedAt, 0); assert.equal(f.timers.size, 0);
    assert.equal(value.installSpec, "github:Syngnat/dsh-prompt-assist");
  }
});

test("only stable release records and exact required field types are accepted", async t => {
  for (const value of [release("v1.3.0", { draft: true }), release("v1.3.0", { prerelease: true }),
    release("v1.3.0-beta.1"), release("v1.3.0-rc.2"), release("nightly"), release("latest"), release("v01.3.0"),
    release("v1.3"), release("vv1.3.0"), release(" v1.3.0"), release("v1.3.0", { draft: "false" }),
    release("v1.3.0", { prerelease: undefined }), release("v1.3.0", { tag_name: 13 }), {}, [], null]) {
    const f = fixture(t, { fetch: async () => json(value) });
    const result = await f.service.check(); assert.equal(result.status, "error"); assert.equal(result.error, "invalid-response");
    assert.equal(result.latestVersion, null); assert.equal(result.releaseUrl, null);
  }
});

test("release URL must be the exact repository tag and is canonicalized safely", async t => {
  for (const html_url of ["https://evil.example/releases/tag/v1.3.0", "http://github.com/Syngnat/dsh-prompt-assist/releases/tag/v1.3.0",
    "https://github.com/Other/repo/releases/tag/v1.3.0", "https://user:pass@github.com/Syngnat/dsh-prompt-assist/releases/tag/v1.3.0",
    "https://github.com/Syngnat/dsh-prompt-assist/releases/tag/v1.3.0?tracking=secret", "https://github.com/Syngnat/dsh-prompt-assist/releases/tag/v1.3.0#fragment",
    "https://github.com/Syngnat/dsh-prompt-assist/releases/tag/v1.4.0", "https://github.com/Syngnat/dsh-prompt-assist/releases/tag/v1.3.0/extra"]) {
    const f = fixture(t, { fetch: async () => json(release("v1.3.0", { html_url })) });
    assert.equal((await f.service.check()).error, "invalid-response");
  }
  const f = fixture(t, { fetch: async () => json(release("v1.3.0+build.1")) });
  const value = await f.service.check(); assert.equal(value.status, "update-available");
  assert.equal(value.releaseUrl, "https://github.com/Syngnat/dsh-prompt-assist/releases/tag/v1.3.0%2Bbuild.1");
});

test("check sends one fixed unauthenticated GET with a generic UA and no session or model input", async t => {
  const f = fixture(t, { sessionId: "PRIVATE_SESSION", files: ["PRIVATE_FILE"], model: "PRIVATE_MODEL" });
  await f.service.check(); const [url, options] = f.calls[0];
  assert.equal(url, RELEASE_API); assert.equal(options.method, "GET"); assert.equal(options.redirect, "manual");
  assert.equal(options.credentials, "omit"); assert.equal(options.referrerPolicy, "no-referrer");
  assert.deepEqual(Object.keys(options.headers), ["User-Agent"]); assert.match(options.headers["User-Agent"], /^dsh-prompt-assist/);
  assert.equal(Object.hasOwn(options, "body"), false); assert.ok(options.signal instanceof AbortSignal);
  assert.doesNotMatch(JSON.stringify([url, options, f.service.status()]), /PRIVATE_/); assert.equal(f.count, 1);
});

test("redirects and unexpected final response origins are rejected, never followed", async t => {
  for (const response of [new Response(null, { status: 301, headers: { location: "https://evil.example" } }),
    Object.assign(json(release()), {})]) {
    if (response.status === 200) Object.defineProperty(response, "url", { value: "https://evil.example/release" });
    const f = fixture(t, { fetch: async () => response });
    assert.equal((await f.service.check()).error, "invalid-response"); assert.equal(f.count, 1);
    assert.equal(f.calls[0][1].redirect, "manual");
  }
});

test("HTTP failure codes are sanitized and never reveal response or transport details", async t => {
  for (const [status, error] of [[403, "rate-limited"], [429, "rate-limited"], [404, "not-found"], [500, "network"], [401, "invalid-response"]]) {
    const f = fixture(t, { fetch: async () => new Response("RAW_SECRET_UPSTREAM", { status }) });
    const result = await f.service.check(); assert.equal(result.error, error); assert.equal(result.status, "error");
    assert.doesNotMatch(JSON.stringify(result), /RAW_SECRET/);
  }
  const f = fixture(t, { fetch: async () => { throw new Error("RAW_SECRET_FETCH_DETAILS"); } });
  assert.equal((await f.service.check()).error, "network"); assert.doesNotMatch(JSON.stringify(f.service.status()), /RAW_SECRET/);
});

test("declared oversize body is cancelled before reading any bytes", async t => {
  const stream = streamBody([encode("not read")]);
  const f = fixture(t, { fetch: async () => new Response(stream.body, { headers: { "Content-Type": "application/json", "Content-Length": String(MAX_RESPONSE_BYTES + 1) } }) });
  assert.equal((await f.service.check()).error, "invalid-response"); assert.equal(stream.pulls, 0); assert.equal(stream.cancelled, 1);
});

test("actual body budget is enforced even with a lying content length", async t => {
  const stream = streamBody([new Uint8Array(140000).fill(120), new Uint8Array(140000).fill(120), encode("never read")]);
  const f = fixture(t, { fetch: async () => new Response(stream.body, { headers: { "Content-Type": "application/json", "Content-Length": "1" } }) });
  assert.equal((await f.service.check()).error, "invalid-response"); assert.equal(stream.pulls, 2); assert.equal(stream.cancelled, 1);
});

test("an exactly-at-limit JSON record is accepted without exposing its unrelated release notes", async t => {
  const value = { ...release(), notes: "" };
  value.notes = "x".repeat(MAX_RESPONSE_BYTES - encode(JSON.stringify(value)).byteLength);
  const bytes = encode(JSON.stringify(value)); assert.equal(bytes.byteLength, MAX_RESPONSE_BYTES);
  const f = fixture(t, { fetch: async () => new Response(bytes, { headers: { "Content-Type": "application/json" } }) });
  const result = await f.service.check(); assert.equal(result.status, "update-available"); assert.equal(Object.hasOwn(result, "notes"), false);
});

test("invalid JSON, UTF-8, content type and content length reject explicitly", async t => {
  for (const response of [new Response("{", { headers: { "Content-Type": "application/json" } }),
    new Response(new Uint8Array([255]), { headers: { "Content-Type": "application/json" } }),
    new Response("html", { headers: { "Content-Type": "text/html" } }),
    new Response(JSON.stringify(release()), { headers: { "Content-Type": "application/json", "Content-Length": "bad" } })]) {
    const f = fixture(t, { fetch: async () => response }); assert.equal((await f.service.check()).error, "invalid-response");
  }
});

test("simultaneous explicit checks merge into one job and one ten-second deadline", async t => {
  const gate = deferred(), started = deferred();
  const f = fixture(t, { fetch: async () => { started.resolve(); await gate.promise; return json(release()); } });
  const a = f.service.check(), b = f.service.check(), c = f.service.check();
  assert.strictEqual(a, b); assert.strictEqual(b, c); await started.promise;
  assert.equal(f.count, 1); assert.equal(f.service.status().status, "idle");
  assert.equal(f.timers.size, 1); assert.equal([...f.timers.values()][0].ms, CHECK_TIMEOUT_MS);
  gate.resolve(); const values = await Promise.all([a, b, c]); assert.ok(values.every(value => value.status === "update-available"));
  assert.equal(f.timers.size, 0); assert.equal(f.service.active, null);
});

test("cooldown prevents extra requests but passage of time never triggers automatic checking", async t => {
  const f = fixture(t); await f.service.check();
  f.setTime(CHECK_COOLDOWN_MS - 1); await f.service.check(); assert.equal(f.count, 1);
  f.setTime(CHECK_COOLDOWN_MS); assert.equal(f.count, 1); await f.service.check(); assert.equal(f.count, 2);
  f.setTime(CHECK_COOLDOWN_MS * 100); f.service.status(); assert.equal(f.count, 2);
});

test("an error after a successful cache never masquerades as current or latest", async t => {
  let calls = 0;
  const f = fixture(t, { fetch: async () => { if (++calls === 1) return json(release()); throw new Error("failure"); } });
  assert.equal((await f.service.check()).status, "update-available");
  f.setTime(CHECK_COOLDOWN_MS); const failed = await f.service.check();
  assert.equal(failed.status, "error"); assert.equal(failed.error, "network"); assert.equal(failed.latestVersion, null); assert.equal(failed.releaseUrl, null);
  assert.equal(failed.checkedAt, CHECK_COOLDOWN_MS); await f.service.check(); assert.equal(f.count, 2);
});

test("hard timeout settles even an uncooperative fetch and clears owned timers", async t => {
  const started = deferred(); let signal;
  const f = fixture(t, { fetch: async (_url, options) => { signal = options.signal; started.resolve(); return new Promise(() => {}); } });
  const pending = f.service.check(); await started.promise; f.setTime(CHECK_TIMEOUT_MS); f.fire();
  const result = await pending; assert.equal(result.error, "timeout"); assert.equal(signal.aborted, true);
  assert.equal(f.timers.size, 0); assert.equal(result.checkedAt, CHECK_TIMEOUT_MS);
});

test("timeout also covers stalled response bodies and cancels their reader", async t => {
  const reading = deferred(); let cancelled = 0;
  const body = new ReadableStream({ pull() { reading.resolve(); return new Promise(() => {}); }, cancel() { cancelled++; } }, { highWaterMark: 0 });
  const f = fixture(t, { fetch: async () => new Response(body, { headers: { "Content-Type": "application/json" } }) });
  const pending = f.service.check(); await reading.promise; f.fire();
  assert.equal((await pending).error, "timeout"); assert.equal(cancelled, 1); assert.equal(f.timers.size, 0);
});

test("dispose prevents queued checks from calling fetch and disallows future network work", async t => {
  const f = fixture(t); const pending = f.service.check(); f.service.dispose();
  assert.equal((await pending).status, "error"); assert.equal(f.count, 0); assert.equal(f.timers.size, 0);
  await f.service.check(); assert.equal(f.count, 0);
});

test("unload cancels in-flight work and late results cannot revive a stale success", async t => {
  const gate = deferred(), started = deferred(), cancelled = deferred(); let signal;
  const f = fixture(t, { fetch: async (_url, options) => { signal = options.signal; started.resolve(); return gate.promise; } });
  const pending = f.service.check(); await started.promise; f.service.dispose();
  assert.equal((await pending).error, "network"); assert.equal(signal.aborted, true); assert.equal(f.timers.size, 0);
  const body = new ReadableStream({ cancel() { cancelled.resolve(); } }, { highWaterMark: 0 });
  gate.resolve(new Response(body, { headers: { "Content-Type": "application/json" } })); await cancelled.promise;
  assert.equal(f.service.status().status, "error"); assert.equal(f.service.status().latestVersion, null);
});

test("clock rollback does not trap an explicit check in a future cooldown", async t => {
  const f = fixture(t); f.setTime(50000); await f.service.check(); f.setTime(1); await f.service.check(); assert.equal(f.count, 2);
});

test("invalid trusted constructor dependencies fail before any request is possible", () => {
  assert.throws(() => new UpdateService({ currentVersion: "bad" }), /Invalid current/);
  assert.throws(() => new UpdateService({ currentVersion: "1.2.0", timeoutMs: CHECK_TIMEOUT_MS + 1 }), /Invalid update/);
  assert.throws(() => new UpdateService({ currentVersion: "1.2.0", fetch: null }), /Invalid update/);
});
