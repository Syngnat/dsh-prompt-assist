import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openPriorityProviders, effectiveProviders } from "../assist/priority-providers.js";

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class Schema {
  constructor(read) { this.read = read; } parse(value) { return this.read(value); } strict() { return this; }
  int() { const prev = this.read; return new Schema(value => { value = prev(value); if (!Number.isInteger(value)) throw Error("schema"); return value; }); }
  min(n) { const prev = this.read; return new Schema(value => { value = prev(value); if ((typeof value === "number" ? value : value.length) < n) throw Error("schema"); return value; }); }
  max(n) { const prev = this.read; return new Schema(value => { value = prev(value); if ((typeof value === "number" ? value : value.length) > n) throw Error("schema"); return value; }); }
  regex(pattern) { const prev = this.read; return new Schema(value => { value = prev(value); if (!pattern.test(value)) throw Error("schema"); return value; }); }
}
const z = {
  number: () => new Schema(value => { if (typeof value !== "number" || !Number.isFinite(value)) throw Error("schema"); return value; }),
  string: () => new Schema(value => { if (typeof value !== "string") throw Error("schema"); return value; }),
  array: schema => new Schema(value => { if (!Array.isArray(value)) throw Error("schema"); return value.map(item => schema.parse(item)); }),
  object: shape => new Schema(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(shape, key))) throw Error("schema");
    return Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.parse(value[key])]));
  }),
};
function fixture() {
  const disk = new Map(), live = new Set(), specs = [], writes = [], modelReads = [], hooks = {}; let closed = 0, registryReads = 0;
  const providers = [{ id: "deep", name: "Deep only" }, { id: "proxy", name: "GPT proxy" }];
  const models = new Map([["deep", [{ id: "deepseek-chat" }]], ["proxy", [{ id: "gpt-4o" }, { id: "deepseek-chat" }, { id: "o3" }]]]);
  const llm = { listProviders() { registryReads++; if (hooks.registry) return hooks.registry(); return providers; },
    async listModels(provider) { modelReads.push(provider); if (hooks.models) return hooks.models(provider); return models.get(provider) ?? []; } };
  const storageDomain = { async open(spec) {
    specs.push(spec); await hooks.open?.(spec); if (live.has(spec.name)) throw Error("already open"); live.add(spec.name);
    let value = structuredClone(disk.has(spec.name) ? disk.get(spec.name) : spec.global.initial), done = false;
    return { global: { get() { return value; }, async set(next) {
      if (done) throw Error("closed"); writes.push(structuredClone(next)); await hooks.write?.(next);
      value = structuredClone(next); disk.set(spec.name, value);
    } }, async close() { if (!done) { done = true; closed++; live.delete(spec.name); } } };
  } };
  const ctx = (dir = resolve("synthetic-priority-profiles", "A")) => ({ get(name) {
    if (name === "profileContext") return { dir }; if (name === "storageDomain") return storageDomain; if (name === "llm") return llm;
    throw Error("must not read sessions, files, credentials, or call a model");
  } });
  return { ctx, llm, storageDomain, providers, models, disk, specs, writes, modelReads, hooks, get closed() { return closed; }, get registryReads() { return registryReads; } };
}
async function opened(t, f = fixture(), configured = ["openai"], dir) {
  const store = await openPriorityProviders(f.ctx(dir), z, configured); t.after(() => store.close()); return { store, f };
}

test("only registered providers with OpenAI catalog models can be granted persistent Priority authorization", async t => {
  const { store, f } = await opened(t);
  assert.equal(f.registryReads, 0); assert.equal(f.modelReads.length, 0);
  assert.deepEqual(await store.candidates(), [{ id: "proxy", name: "GPT proxy", configured: false, openAIModels: ["gpt-4o", "o3"] }]);
  await assert.rejects(store.authorize("deep", { expectedRevision: 0, consent: true }), { code: "provider-not-openai" });
  assert.equal(f.writes.length, 0);
  const value = await store.authorize("proxy", { expectedRevision: 0, consent: true });
  assert.deepEqual(value, { revision: 1, authorized: ["proxy"] }); assert.strictEqual(value, store.snapshot());
  assert.deepEqual(effectiveProviders(["openai", "proxy", "openai"], value.authorized), ["openai", "proxy"]);
  await store.close(); const again = await openPriorityProviders(f.ctx(), z, ["openai"]); t.after(() => again.close());
  assert.deepEqual(again.snapshot(), value);
});

test("candidate model samples are unique, bounded to eight, and mark configured providers", async t => {
  const f = fixture(); f.models.set("proxy", [{ id: "gpt-x" }, { id: "gpt-x" }, ...Array.from({ length: 12 }, (_, i) => ({ id: "GPT-" + i }))]);
  const { store } = await opened(t, f, ["proxy"]); const values = await store.candidates();
  assert.equal(values.length, 1); assert.equal(values[0].configured, true); assert.equal(values[0].openAIModels.length, 8);
  assert.equal(new Set(values[0].openAIModels).size, 8); assert.equal(f.writes.length, 0);
});

test("unregistered and differently-cased ids cannot be authorized or trigger model-directory reads", async t => {
  const { store, f } = await opened(t);
  for (const id of ["missing", "Proxy"]) await assert.rejects(store.authorize(id, { expectedRevision: 0, consent: true }), { code: "provider-unknown" });
  assert.equal(f.modelReads.length, 0); assert.equal(f.writes.length, 0);
});

test("explicit consent is mandatory and malformed provider ids fail without writes", async t => {
  const { store, f } = await opened(t);
  for (const consent of [undefined, false, 1, "true"]) await assert.rejects(store.authorize("proxy", { expectedRevision: 0, consent }), { code: "consent-required" });
  for (const provider of ["", "_bad", "bad/path", "bad\n", "two words", "国", "a".repeat(65), null, 12]) {
    await assert.rejects(store.authorize(provider, { expectedRevision: 0, consent: true }), { code: "invalid-provider" });
  }
  assert.equal(f.registryReads, 0); assert.equal(f.writes.length, 0);
});

for (const mode of ["missing", "throws", "malformed"]) {
  test("a " + mode + " model catalog never grants authorization", async t => {
    const { store, f } = await opened(t);
    if (mode === "missing") delete f.llm.listModels;
    else f.hooks.models = () => { if (mode === "throws") throw Error("PRIVATE_PATH_TOKEN"); return { models: [{ id: "gpt-4" }] }; };
    assert.deepEqual(await store.candidates(), []);
    await assert.rejects(store.authorize("proxy", { expectedRevision: 0, consent: true }), { code: "provider-not-openai" });
    assert.equal(f.writes.length, 0);
  });
}

test("authorization rechecks the registry and catalog instead of trusting prior candidate results", async t => {
  const { store, f } = await opened(t); assert.equal((await store.candidates()).length, 1);
  f.models.set("proxy", [{ id: "deepseek-chat" }]);
  await assert.rejects(store.authorize("proxy", { expectedRevision: 0, consent: true }), { code: "provider-not-openai" });
  f.providers.splice(1, 1);
  await assert.rejects(store.authorize("proxy", { expectedRevision: 0, consent: true }), { code: "provider-unknown" });
  assert.equal(f.writes.length, 0);
});

test("configured providers cannot be self-authorized or revoked", async t => {
  const { store, f } = await opened(t, fixture(), ["proxy"]);
  await assert.rejects(store.authorize("proxy", { expectedRevision: 0, consent: true }), { code: "configured-provider" });
  await assert.rejects(store.revoke("proxy", { expectedRevision: 0 }), { code: "configured-provider" });
  assert.equal(f.writes.length, 0); assert.deepEqual(store.snapshot().authorized, []);
});

test("snapshots are immutable and repeated authorization is a no-op at the current revision", async t => {
  const { store, f } = await opened(t); const old = store.snapshot(); assert.strictEqual(store.snapshot(), old);
  const value = await store.authorize("proxy", { expectedRevision: 0, consent: true });
  assert.ok(Object.isFrozen(value)); assert.ok(Object.isFrozen(value.authorized)); assert.throws(() => value.authorized.push("deep"));
  assert.strictEqual(await store.authorize("proxy", { expectedRevision: 1, consent: true }), value);
  await assert.rejects(store.authorize("proxy", { expectedRevision: 0, consent: true }), { code: "stale-revision" });
  assert.equal(f.writes.length, 1); assert.deepEqual(old.authorized, []);
});

test("revocation removes only self-authorizations and works after the adapter goes offline", async t => {
  const { store, f } = await opened(t); await store.authorize("proxy", { expectedRevision: 0, consent: true });
  f.providers.length = 0;
  await assert.rejects(store.revoke("proxy", { expectedRevision: 0 }), { code: "stale-revision" });
  const value = await store.revoke("proxy", { expectedRevision: 1 }); assert.deepEqual(value, { revision: 2, authorized: [] });
  assert.strictEqual(await store.revoke("proxy", { expectedRevision: 2 }), value); assert.equal(f.writes.length, 2);
});

test("CAS is mandatory and serializes concurrent grants without losing updates", async t => {
  const { store, f } = await opened(t); f.providers.push({ id: "other", name: "Other" }); f.models.set("other", [{ id: "codex" }]);
  for (const expectedRevision of [undefined, null, "0", -1, 0.5]) await assert.rejects(store.authorize("proxy", { expectedRevision, consent: true }), { code: "stale-revision" });
  const values = await Promise.allSettled([store.authorize("proxy", { expectedRevision: 0, consent: true }), store.authorize("other", { expectedRevision: 0, consent: true })]);
  assert.equal(values[0].status, "fulfilled"); assert.equal(values[1].reason.code, "stale-revision");
  await store.authorize("other", { expectedRevision: 1, consent: true }); assert.deepEqual(store.snapshot().authorized, ["proxy", "other"]);
  assert.equal(f.writes.length, 2);
});

test("provider-limit rejects a thirty-third self-authorization without writing", async t => {
  const { store, f } = await opened(t);
  for (let i = 0; i < 33; i++) { const id = "p" + i; f.providers.push({ id, name: id }); f.models.set(id, [{ id: "gpt-test" }]); }
  for (let i = 0; i < 32; i++) await store.authorize("p" + i, { expectedRevision: i, consent: true });
  await assert.rejects(store.authorize("p32", { expectedRevision: 32, consent: true }), { code: "provider-limit" });
  assert.equal(store.snapshot().revision, 32); assert.equal(store.snapshot().authorized.length, 32); assert.equal(f.writes.length, 32);
});

test("durability precedes publication; observer errors do not affect the committed grant", async t => {
  const { store, f } = await opened(t), gate = deferred(), started = deferred(), seen = [];
  f.hooks.write = () => { started.resolve(); return gate.promise; };
  store.subscribe(value => { seen.push(value); throw Error("observer"); }); store.subscribe(async () => { throw Error("async observer"); });
  const old = store.snapshot(), pending = store.authorize("proxy", { expectedRevision: 0, consent: true }); await started.promise;
  try { assert.strictEqual(store.snapshot(), old); assert.equal(seen.length, 0); } finally { gate.resolve(); }
  const value = await pending; assert.strictEqual(seen[0], value); assert.equal(seen.length, 1); assert.deepEqual(f.disk.get(f.specs[0].name), { revision: 1, providers: ["proxy"] });
});

test("backend failures leave the snapshot untouched and the next write can recover", async t => {
  const { store, f } = await opened(t), seen = []; const old = store.snapshot(); store.subscribe(value => seen.push(value));
  f.hooks.write = () => { throw Error("PRIVATE_FS_PATH"); };
  await assert.rejects(store.authorize("proxy", { expectedRevision: 0, consent: true }), { code: "global-settings-unavailable" });
  assert.strictEqual(store.snapshot(), old); assert.equal(seen.length, 0);
  delete f.hooks.write; assert.equal((await store.authorize("proxy", { expectedRevision: 0, consent: true })).revision, 1);
});

test("unavailable storage or profile identity never creates an in-memory authorization fallback", async () => {
  for (const ctx of [{}, { storageDomain: { open() { throw Error("PRIVATE_DISK"); } }, profileContext: { dir: resolve("synthetic") } }, { storageDomain: fixture().storageDomain, profileContext: { dir: "relative" } }]) {
    await assert.rejects(openPriorityProviders(ctx, z, []), { code: "global-settings-unavailable" });
  }
});

test("corrupt stored records are rejected and acquired domains are closed", async () => {
  for (const corrupt of [null, { revision: -1, providers: [] }, { revision: 0, providers: ["bad/path"] }, { revision: 0, providers: ["proxy", "proxy"] }, { revision: 0, providers: ["proxy"], secret: "no" }, { revision: 0, providers: Array.from({ length: 33 }, (_, i) => "p" + i) }]) {
    const f = fixture(), store = await openPriorityProviders(f.ctx(), z, []); await store.close();
    f.disk.set(f.specs[0].name, corrupt);
    await assert.rejects(openPriorityProviders(f.ctx(), z, []), { code: "global-settings-unavailable" }); assert.equal(f.closed, 2);
  }
});

test("domains hash normalized profile identity and keep profiles isolated", async t => {
  const f = fixture(), a = (await opened(t, f, [], resolve("synthetic", "A"))).store, b = (await opened(t, f, [], resolve("synthetic", "B"))).store;
  assert.notEqual(f.specs[0].name, f.specs[1].name); assert.match(f.specs[0].name, /^local_prompt_assist_priority_[a-f0-9]{64}$/);
  await a.authorize("proxy", { expectedRevision: 0, consent: true }); assert.deepEqual(b.snapshot().authorized, []);
  await a.close(); const again = await openPriorityProviders(f.ctx(resolve("synthetic", "A", ".")), z, []); t.after(() => again.close());
  assert.equal(f.specs[2].name, f.specs[0].name); assert.deepEqual(again.snapshot().authorized, ["proxy"]);
});

test("abort before the commit prevents writes; a started durable commit is reported truthfully", async t => {
  const { store, f } = await opened(t), cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(store.authorize("proxy", { expectedRevision: 0, consent: true, signal: cancelled.signal }), { name: "AbortError" }); assert.equal(f.writes.length, 0);
  const gate = deferred(), started = deferred(), signal = new AbortController(); f.hooks.write = () => { started.resolve(); return gate.promise; };
  const pending = store.authorize("proxy", { expectedRevision: 0, consent: true, signal: signal.signal }); await started.promise;
  signal.abort(); gate.resolve(); assert.equal((await pending).revision, 1);
});

test("close is idempotent, drains accepted writes, rejects new work and owns only its domain", async t => {
  const { store, f } = await opened(t), gate = deferred(), started = deferred(); f.hooks.write = () => { started.resolve(); return gate.promise; };
  const pending = store.authorize("proxy", { expectedRevision: 0, consent: true }); await started.promise;
  const close = store.close(); assert.strictEqual(store.close(), close); assert.equal(f.closed, 0);
  await assert.rejects(store.authorize("proxy", { expectedRevision: 0, consent: true }), { code: "global-settings-unavailable" });
  gate.resolve(); await pending; await close; assert.equal(f.closed, 1);
});

async function rpcFixture(t, suppliedStore, suppliedLlm) {
  const { installPriorityRpc, PRIORITY_ENDPOINT } = await import("../assist/priority-transport.js");
  const data = suppliedStore ? { store: suppliedStore } : await opened(t); let route, unregistered = 0;
  const ctx = { get(name) { if (name === "llm") return suppliedLlm; throw Error("must not read " + name); },
    connection: { fetch: { register(value) { route = value; return async () => { unregistered++; }; } } } };
  const stop = installPriorityRpc(ctx, data.store, ["openai", "openai"]); t.after(stop);
  const envelope = payload => ({ type: "client-request", rpcId: "r1", method: PRIORITY_ENDPOINT, payload });
  const post = (payload, changes = {}, contentType = "application/json") => route.fetch(new Request("http://connection.invalid" + route.path, {
    method: "POST", headers: { "Content-Type": contentType }, body: JSON.stringify({ ...envelope(payload), ...changes }),
  }));
  return { ...data, route, post, stop, envelope, get unregistered() { return unregistered; } };
}

test("owner RPC receipts include the standard envelope and authoritative configured/authorized/effective sets", async t => {
  const f = await rpcFixture(t); assert.deepEqual(f.route.methods, ["POST"]); assert.equal(f.route.path, "/api/local-openai-fast.priority");
  const first = await f.post({ action: "snapshot" }); assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { type: "server-response", rpcId: "r1", result: { ok: true, value: { revision: 0, configured: ["openai"], authorized: [], effective: ["openai"], names: {} } } });
  const granted = await (await f.post({ action: "authorize", provider: "proxy", consent: true, expectedRevision: 0 })).json();
  assert.deepEqual(granted.result.value, { revision: 1, configured: ["openai"], authorized: ["proxy"], effective: ["openai", "proxy"], names: {} });
  const candidates = await (await f.post({ action: "candidates" })).json();
  assert.deepEqual(candidates.result.value.candidates, [{ id: "proxy", name: "GPT proxy", configured: false, openAIModels: ["gpt-4o", "o3"] }]);
  const revoked = await (await f.post({ action: "revoke", provider: "proxy", expectedRevision: 1 })).json();
  assert.equal(revoked.result.value.revision, 2); assert.deepEqual(revoked.result.value.authorized, []); assert.equal(Object.hasOwn(revoked.result.value, "candidates"), false);
});

test("receipts carry display names for exactly the providers they list", async t => {
  const llm = { async listProviders() { return [
    { id: "openai", name: "OpenAI" },
    { id: "proxy", name: "GPT\nproxy\tX" },
    { id: "unrelated", name: "Must not be disclosed" },
    { id: "same", name: "same" },
  ]; } };
  const f = await rpcFixture(t, undefined, llm);
  const snapshot = (await (await f.post({ action: "snapshot" })).json()).result.value;
  // Only the configured id is listed, so only its name may travel.
  assert.deepEqual(snapshot.names, { openai: "OpenAI" });
  const candidates = (await (await f.post({ action: "candidates" })).json()).result.value;
  assert.deepEqual(candidates.names, { openai: "OpenAI", proxy: "GPT proxy X" });
  // A name identical to the id adds nothing; a failing registry must not break the receipt.
  const echo = { async listProviders() { return [{ id: "openai", name: "openai" }]; } };
  const echoed = await rpcFixture(t, undefined, echo);
  const echoValue = (await (await echoed.post({ action: "snapshot" })).json()).result.value;
  assert.deepEqual(echoValue.names, {});
  const broken = { async listProviders() { throw Error("registry offline"); } };
  const failed = await rpcFixture(t, undefined, broken);
  const failedReply = await (await failed.post({ action: "snapshot" })).json();
  assert.equal(failedReply.result.ok, true); assert.deepEqual(failedReply.result.value.names, {});
});

test("malformed non-string RPC actions never coerce into a privileged action", async t => {  const f = await rpcFixture(t);
  for (const action of [["snapshot"], {}, null, "constructor", "__proto__"]) {
    const reply = await (await f.post({ action })).json(); assert.equal(reply.result.error.code, "invalid-request");
  }
  assert.equal(f.f.writes.length, 0);
});

test("a model-directory record that throws during reading fails closed as provider-not-openai", async t => {
  const { store, f } = await opened(t);
  f.hooks.models = () => [{ get id() { throw Error("PRIVATE_MODEL_METADATA"); } }];
  await assert.rejects(store.authorize("proxy", { expectedRevision: 0, consent: true }), { code: "provider-not-openai" });
  assert.equal(f.writes.length, 0);
});

test("invalid media type, JSON and RPC envelopes return 415 or 400 without side effects", async t => {
  const f = await rpcFixture(t);
  assert.equal((await f.post({ action: "snapshot" }, {}, "text/plain")).status, 415);
  for (const changes of [{ method: "wrong" }, { rpcId: null }, { rpcId: 1 }, { rpcId: "x".repeat(201) }, { type: "server-response" }]) {
    const response = await f.post({ action: "snapshot" }, changes); assert.equal(response.status, 400); assert.deepEqual(await response.json(), { error: "invalid-request" });
  }
  const malformed = await f.route.fetch(new Request("http://connection.invalid" + f.route.path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }));
  assert.equal(malformed.status, 400); assert.match(malformed.headers.get("content-type"), /application\/json/);
  assert.equal(f.f.writes.length, 0);
});

test("direct RPC grant attempts cannot bypass consent, registration, catalog, configured or CAS guards", async t => {
  const f = await rpcFixture(t);
  for (const [payload, code] of [
    [{ action: "authorize", provider: "proxy", expectedRevision: 0 }, "consent-required"],
    [{ action: "authorize", provider: "missing", expectedRevision: 0, consent: true }, "provider-unknown"],
    [{ action: "authorize", provider: "deep", expectedRevision: 0, consent: true }, "provider-not-openai"],
    [{ action: "authorize", provider: "bad/path", expectedRevision: 0, consent: true }, "invalid-provider"],
    [{ action: "authorize", provider: "proxy", expectedRevision: 1, consent: true }, "stale-revision"],
    [{ action: "authorize", provider: "openai", expectedRevision: 0, consent: true }, "configured-provider"],
    [{ action: "revoke", provider: "openai", expectedRevision: 0 }, "configured-provider"],
  ]) {
    const body = await (await f.post(payload)).json();
    assert.deepEqual(body.result, { ok: false, error: { code, message: code, details: {} } });
  }
  assert.equal(f.f.writes.length, 0);
});

test("unknown internal failures never disclose stack, storage paths, credentials or arbitrary error codes", async t => {
  const raw = Object.assign(Error("PRIVATE_FS_PATH credential=PRIVATE_TOKEN"), { code: "../PRIVATE_CODE" });
  const f = await rpcFixture(t, { snapshot() { throw raw; } });
  const response = await f.post({ action: "snapshot" }); assert.equal(response.headers.get("cache-control"), "no-store");
  const text = await response.text(); assert.doesNotMatch(text, /PRIVATE|credential|stack|\.\.\//);
  assert.deepEqual(JSON.parse(text).result, { ok: false, error: { code: "global-settings-unavailable", message: "global-settings-unavailable", details: {} } });
});

test("RPC cleanup unregisters its route without closing a caller-owned persistent store", async t => {
  const f = await rpcFixture(t); await f.stop(); assert.equal(f.unregistered, 1); assert.equal(f.f.closed, 0);
  assert.deepEqual(f.store.snapshot(), { revision: 0, authorized: [] });
});

test("a cancelled owner request never reaches authorization", async t => {
  const f = await rpcFixture(t), abort = new AbortController(); abort.abort();
  const response = await f.route.fetch(new Request("http://connection.invalid" + f.route.path, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(f.envelope({ action: "authorize", provider: "proxy", consent: true, expectedRevision: 0 })), signal: abort.signal }));
  assert.equal((await response.json()).result.error.code, "cancelled"); assert.equal(f.f.writes.length, 0);
});

test("Windows path case aliases reopen the same profile authorization domain", async t => {
  if (process.platform !== "win32") { t.skip("Windows profile identity normalization"); return; }
  const f = fixture(), path = resolve("synthetic-priority-profiles", "MixedCase"), { store } = await opened(t, f, [], path);
  await store.authorize("proxy", { expectedRevision: 0, consent: true }); await store.close();
  const again = await openPriorityProviders(f.ctx(path.toUpperCase()), z, []); t.after(() => again.close());
  assert.equal(f.specs[1].name, f.specs[0].name); assert.deepEqual(again.snapshot().authorized, ["proxy"]);
});

test("an unavailable or malformed registered-provider directory cannot be replaced by configuration guesses", async t => {
  for (const mode of ["missing", "throws", "malformed"]) {
    const { store, f } = await opened(t);
    if (mode === "missing") delete f.llm.listProviders;
    else f.hooks.registry = () => { if (mode === "throws") throw Error("PRIVATE_REGISTRY"); return { providers: ["proxy"] }; };
    await assert.rejects(store.authorize("proxy", { expectedRevision: 0, consent: true }), { code: "provider-unknown" });
    await assert.rejects(store.candidates(), { code: "provider-unknown" });
    assert.equal(f.writes.length, 0); assert.equal(f.modelReads.length, 0);
  }
});
