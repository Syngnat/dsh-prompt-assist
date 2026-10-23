import test from "node:test";
import assert from "node:assert/strict";
import { resolve, sep } from "node:path";
import { openEnablement } from "../assist/enablement-store.js";

const clone = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const initial = () => ({ revision: 0, enabled: { suggest: true, enhance: true } });
class Schema {
  constructor(parse) { this.read = parse; }
  parse(value) { return this.read(value); }
  strict() { return this; }
  int() { const prior = this.read; return new Schema(value => { const result = prior(value); if (!Number.isInteger(result)) throw Error("schema"); return result; }); }
  min(bound) { const prior = this.read; return new Schema(value => { const result = prior(value); if (result < bound) throw Error("schema"); return result; }); }
  max(bound) { const prior = this.read; return new Schema(value => { const result = prior(value); if (result > bound) throw Error("schema"); return result; }); }
}
const z = {
  boolean: () => new Schema(value => { if (typeof value !== "boolean") throw Error("schema"); return value; }),
  number: () => new Schema(value => { if (typeof value !== "number" || !Number.isFinite(value)) throw Error("schema"); return value; }),
  object: shape => new Schema(value => {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(shape, key))) throw Error("schema");
    return Object.fromEntries(Object.entries(shape).map(([key, schema]) => [key, schema.parse(value[key])]));
  }),
};
function fixture() {
  const durable = new Map(), live = new Set(), specs = [], writes = [], hooks = {}; let closed = 0;
  const facility = { async open(spec) {
    specs.push(spec); if (hooks.open) await hooks.open(spec);
    if (live.has(spec.name)) throw Error("already open"); live.add(spec.name);
    let record = clone(durable.get(spec.name) ?? spec.global.initial), done = false;
    return { global: { get() { return record; }, async set(value) {
      if (done) throw Error("closed"); writes.push(clone(value)); await hooks.write?.(value);
      durable.set(spec.name, clone(value)); record = value;
    } }, async close() { if (!done) { await hooks.close?.(); done = true; closed++; live.delete(spec.name); } } };
  } };
  const ctx = (dir = resolve("synthetic-profiles", "alpha")) => ({ get(name) {
    if (name === "storageDomain") return facility;
    if (name === "profileContext") return { dir };
    throw Error("must not inspect sessions or other services");
  } });
  return { durable, live, specs, writes, hooks, ctx, facility, get closed() { return closed; } };
}
async function opened(t, f = fixture(), dir) { const store = await openEnablement(f.ctx(dir), z); t.after(() => store.close()); return { store, f }; }

test("initial profile snapshot is stable, detached, deeply immutable and never migrates session flags", async t => {
  const { store, f } = await opened(t); const snapshot = store.getSnapshot();
  assert.strictEqual(store.getSnapshot(), snapshot); assert.deepEqual(snapshot, { scope: "profile", ...initial() });
  assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot.enabled));
  assert.throws(() => { snapshot.enabled.suggest = true; }, TypeError);
  assert.equal(f.writes.length, 0); assert.deepEqual(f.specs[0].tables, {}); assert.equal(f.specs[0].version, 1);
  assert.match(f.specs[0].name, /^local_prompt_assist_enabled_[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(snapshot).includes("synthetic-profiles"), false);
});

test("a committed write returns the published snapshot and survives closing then reopening the store", async t => {
  const { store, f } = await opened(t); const seen = []; store.subscribe(value => seen.push(value));
  const value = await store.set("suggest", false); assert.strictEqual(value, store.getSnapshot());
  assert.equal(value.revision, 1); assert.equal(value.enabled.suggest, false); assert.equal(value.enabled.enhance, true);
  assert.strictEqual(seen[0], value); assert.deepEqual(f.writes[0], { revision: 1, enabled: { suggest: false, enhance: true } });
  await store.close(); const next = await openEnablement(f.ctx(), z); t.after(() => next.close());
  assert.deepEqual(next.getSnapshot(), value); assert.equal(f.closed, 1);
});

test("two profile identities remain isolated on the same backend root and facility", async t => {
  const f = fixture(), a = await opened(t, f, resolve("synthetic-profiles", "alpha")), b = await opened(t, f, resolve("synthetic-profiles", "beta"));
  await a.store.set("suggest", false); assert.deepEqual(b.store.getSnapshot(), { scope: "profile", ...initial() });
  await b.store.set("enhance", false); assert.deepEqual(a.store.getSnapshot().enabled, { suggest: false, enhance: true });
  assert.notEqual(f.specs[0].name, f.specs[1].name);
  for (const spec of f.specs) assert.equal(spec.name.includes("synthetic"), false);
  await a.store.close(); await b.store.close();
  const again = await opened(t, f, resolve("synthetic-profiles", "alpha")); assert.deepEqual(again.store.getSnapshot().enabled, { suggest: false, enhance: true });
});

test("canonical aliases use the same stable namespace without filesystem realpath", async t => {
  const f = fixture(), dir = resolve("synthetic-profiles", "配置 Alpha"), first = await opened(t, f, dir);
  await first.store.set("enhance", false); await first.store.close();
  const alias = dir + sep + ".." + sep + "配置 Alpha" + sep;
  const next = await opened(t, f, process.platform === "win32" ? alias.toUpperCase() : alias);
  assert.equal(f.specs[0].name, f.specs[1].name); assert.equal(next.store.getSnapshot().enabled.enhance, false);
});

test("concurrent feature changes serialize read-modify-write without dropping either update", async t => {
  const { store, f } = await opened(t), started = deferred(), release = deferred(); let count = 0;
  f.hooks.write = async () => { if (++count === 1) { started.resolve(); await release.promise; } };
  const a = store.set("suggest", false), b = store.set("enhance", false); await started.promise;
  assert.equal(f.writes.length, 1); assert.deepEqual(store.getSnapshot().enabled, { suggest: true, enhance: true });
  release.resolve(); await Promise.all([a, b]); assert.equal(store.getSnapshot().revision, 2);
  assert.deepEqual(store.getSnapshot().enabled, { suggest: false, enhance: false });
});

test("CAS is evaluated in write order and rejected mutations do not poison the chain", async t => {
  const { store, f } = await opened(t);
  const results = await Promise.allSettled([store.set("suggest", false, { expectedRevision: 0 }), store.set("enhance", false, { expectedRevision: 0 })]);
  assert.equal(results[0].status, "fulfilled"); assert.equal(results[1].reason.code, "stale-enablement");
  assert.equal(f.writes.length, 1); await store.set("suggest", true, { expectedRevision: 1 });
  assert.deepEqual(store.getSnapshot().enabled, { suggest: true, enhance: true });
});

test("no-op preserves snapshot/revision and emits nothing, but never bypasses a stale CAS", async t => {
  const { store, f } = await opened(t), before = store.getSnapshot(); let calls = 0; store.subscribe(() => calls++);
  assert.strictEqual(await store.set("suggest", true, { expectedRevision: 0 }), before);
  assert.equal(calls, 0); assert.equal(f.writes.length, 0); await store.set("suggest", false);
  await assert.rejects(store.set("suggest", true, { expectedRevision: 0 }), { code: "stale-enablement" });
  assert.equal(store.getSnapshot().revision, 1); assert.equal(calls, 1);
});

test("persist completion precedes publication and notification", async t => {
  const { store, f } = await opened(t), started = deferred(), release = deferred(), before = store.getSnapshot(); const seen = [];
  f.hooks.write = async () => { started.resolve(); await release.promise; };
  store.subscribe(value => { assert.deepEqual(f.durable.get(f.specs[0].name), { revision: value.revision, enabled: value.enabled }); seen.push(value); });
  const pending = store.set("enhance", false); await started.promise;
  assert.strictEqual(store.getSnapshot(), before); assert.equal(seen.length, 0); release.resolve();
  assert.strictEqual(await pending, seen[0]); assert.equal(seen.length, 1);
});

test("durability failure leaves memory and listeners untouched, then later writes still work", async t => {
  const { store, f } = await opened(t), before = store.getSnapshot(); let count = 0; store.subscribe(() => count++);
  f.hooks.write = async () => { throw Error("PRIVATE_BACKEND_PATH"); };
  const error = await store.set("suggest", false).catch(error => error);
  assert.equal(error.code, "global-settings-unavailable"); assert.doesNotMatch(error.message, /PRIVATE/);
  assert.strictEqual(store.getSnapshot(), before); assert.equal(count, 0); assert.equal(f.durable.size, 0);
  delete f.hooks.write; await store.set("suggest", false); assert.equal(store.getSnapshot().revision, 1); assert.equal(count, 1);
});

test("invalid feature, enabled and options reject before persistence", async t => {
  const { store, f } = await opened(t);
  for (const feature of ["other", "__proto__", null, {}]) await assert.rejects(store.set(feature, true), { code: "invalid-feature" });
  for (const value of ["true", 1, null, undefined]) await assert.rejects(store.set("suggest", value), { code: "invalid-enabled" });
  for (const options of [null, [], { expectedRevision: -1 }, { expectedRevision: 1.5 }, { expectedRevision: "0" }, { signal: {} }]) await assert.rejects(store.set("suggest", true, options), { code: "invalid-request" });
  assert.equal(f.writes.length, 0); assert.throws(() => store.subscribe(null), { code: "invalid-request" });
});

test("missing persistence or absolute profile identity never falls back to memory-only success", async () => {
  for (const ctx of [{}, { storageDomain: { open() { throw Error("must not open"); } } },
    { storageDomain: { open() { throw Error("must not open"); } }, profileContext: { dir: "relative" } },
    { profileContext: { dir: resolve("synthetic-profiles", "alpha") } }]) {
    await assert.rejects(openEnablement(ctx, z), { code: "global-settings-unavailable" });
  }
  const f = fixture(); f.hooks.open = async () => { throw Error("PRIVATE_PROFILE_DIR"); };
  const error = await openEnablement(f.ctx(), z).catch(error => error); assert.equal(error.code, "global-settings-unavailable"); assert.doesNotMatch(error.message, /PRIVATE/);
});

test("malformed stored data rejects loudly and closes an opened domain", async () => {
  for (const corrupt of [{ ...initial(), enabled: { suggest: true, enhance: "true" } },
    { ...initial(), revision: -1 }, { ...initial(), sessionSettings: { enabled: true } }]) {
    const f = fixture(); f.hooks.open = spec => f.durable.set(spec.name, corrupt);
    await assert.rejects(openEnablement(f.ctx(), z), { code: "global-settings-unavailable" }); assert.equal(f.closed, 1);
  }
});

test("one open owner is required for a profile; no unsafe existing-domain sharing", async t => {
  const { store, f } = await opened(t); await assert.rejects(openEnablement(f.ctx(), z), { code: "global-settings-unavailable" });
  assert.strictEqual(store.getSnapshot(), store.getSnapshot()); await store.set("suggest", true);
});

test("pre-aborted and queued-aborted mutations perform no durable write", async t => {
  const { store, f } = await opened(t), a = new AbortController(); a.abort();
  await assert.rejects(store.set("suggest", true, { signal: a.signal }), { name: "AbortError" }); assert.equal(f.writes.length, 0);
  const started = deferred(), release = deferred(); f.hooks.write = async () => { started.resolve(); await release.promise; };
  const first = store.set("suggest", false); await started.promise; const b = new AbortController();
  const second = store.set("enhance", false, { signal: b.signal }); const rejected = assert.rejects(second, { name: "AbortError" });
  b.abort(); release.resolve(); await first; await rejected; assert.equal(f.writes.length, 1);
});

test("abort after an irreversible write starts still publishes the real durable result", async t => {
  const { store, f } = await opened(t), started = deferred(), release = deferred(), controller = new AbortController(); const seen = [];
  f.hooks.write = async () => { started.resolve(); await release.promise; }; store.subscribe(value => seen.push(value));
  const pending = store.set("suggest", false, { signal: controller.signal }); await started.promise;
  controller.abort(); release.resolve(); const committed = await pending;
  assert.equal(committed.enabled.suggest, false); assert.strictEqual(seen[0], committed); assert.equal(f.durable.size, 1);
});

test("unsubscribe and faulty observers cannot turn an already committed write into failure", async t => {
  const { store } = await opened(t); let calls = 0; const stop = store.subscribe(() => calls++); stop(); stop();
  store.subscribe(() => { throw Error("observer"); }); store.subscribe(async () => { throw Error("async observer"); });
  assert.equal((await store.set("suggest", false)).enabled.suggest, false); assert.equal(calls, 0);
});

test("close drains accepted writes, rejects new writes, and does not swallow a commit after unsubscribe", async t => {
  const { store, f } = await opened(t), started = deferred(), release = deferred(); let calls = 0;
  f.hooks.write = async () => { started.resolve(); await release.promise; }; const unsubscribe = store.subscribe(() => calls++);
  const pending = store.set("suggest", false); await started.promise; unsubscribe();
  const closing = store.close(); assert.strictEqual(store.close(), closing); assert.equal(f.closed, 0);
  await assert.rejects(store.set("enhance", true), { code: "global-settings-unavailable" }); release.resolve();
  const committed = await pending; await closing; assert.equal(f.closed, 1); assert.equal(calls, 0); assert.equal(committed.enabled.suggest, false);
  assert.deepEqual(store.getSnapshot(), committed); assert.throws(() => store.subscribe(() => {}), { code: "global-settings-unavailable" });
});

test("revision overflow never wraps and a close failure is explicit without reopening writes", async t => {
  const f = fixture(); f.hooks.open = spec => f.durable.set(spec.name, { ...initial(), revision: Number.MAX_SAFE_INTEGER });
  const store = await openEnablement(f.ctx(), z); await assert.rejects(store.set("suggest", false), { code: "global-settings-unavailable" });
  assert.equal(f.writes.length, 0); f.hooks.close = async () => { throw Error("PRIVATE_CLOSE_PATH"); };
  const error = await store.close().catch(error => error); assert.equal(error.code, "global-settings-unavailable"); assert.doesNotMatch(error.message, /PRIVATE/);
  await assert.rejects(store.set("enhance", true), { code: "global-settings-unavailable" });
  // This fixture owns only an in-memory fake; the explicit close rejection above is already observed.
});
