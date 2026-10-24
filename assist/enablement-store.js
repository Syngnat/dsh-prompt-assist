import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

const failure = code => Object.assign(new Error(code), { code });
const unavailable = () => failure("global-settings-unavailable");
const optional = (ctx, name) => typeof ctx?.get === "function" ? ctx.get(name) : ctx?.[name];
const freezeRecord = value => Object.freeze({ revision: value.revision, enabled: Object.freeze({ suggest: value.enabled.suggest, enhance: value.enabled.enhance }), finalAnswer: value.finalAnswer !== false });
const snapshotOf = value => Object.freeze({ scope: "profile", revision: value.revision, enabled: value.enabled, finalAnswer: value.finalAnswer !== false });

function schemaOf(z) {
  return z.object({
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    enabled: z.object({ suggest: z.boolean(), enhance: z.boolean() }).strict(),
    // Optional so records written before this flag existed still parse; a missing value means "on".
    finalAnswer: z.boolean().optional(),
  }).strict();
}

function profileDomain(dir) {
  if (typeof dir !== "string" || !isAbsolute(dir) || dir.includes("\u0000")) throw unavailable();
  // Profile identity is public launcher metadata; do not realpath across permission boundaries.
  const absolute = resolve(dir);
  const canonical = process.platform === "win32" ? absolute.toLowerCase() : absolute;
  return "local_prompt_assist_enabled_" + createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Two profile-global flags only. No session reads, implicit migration, or memory-only fallback. */
export async function openEnablement(ctx, z) {
  let domain;
  try {
    const facility = optional(ctx, "storageDomain"), profile = optional(ctx, "profileContext");
    if (typeof facility?.open !== "function") throw unavailable();
    const name = profileDomain(profile?.dir), schema = schemaOf(z);
    const initial = freezeRecord({ revision: 0, enabled: { suggest: true, enhance: true }, finalAnswer: true });
    domain = await facility.open({ name, version: 1, global: { schema, initial }, tables: {} });
    const global = domain?.global;
    if (typeof global?.get !== "function" || typeof global?.set !== "function" || typeof domain.close !== "function") throw unavailable();
    const loaded = freezeRecord(schema.parse(global.get()));
    return createStore(domain, global, loaded);
  } catch {
    try { await domain?.close(); } catch {}
    throw unavailable();
  }
}

function createStore(domain, global, loaded) {
  let snapshot = snapshotOf(loaded), tail = Promise.resolve(), closing = false, disposal;
  const listeners = new Set();
  function notify() {
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try { void Promise.resolve(listener(snapshot)).catch(() => {}); } catch {}
    }
  }
  function set(feature, enabled, options = {}) {
    if (closing) return Promise.reject(unavailable());
    let signal, expectedRevision;
    try {
      if (feature !== "suggest" && feature !== "enhance") throw failure("invalid-feature");
      if (typeof enabled !== "boolean") throw failure("invalid-enabled");
      if (!options || typeof options !== "object" || Array.isArray(options)
        || Object.keys(options).some(key => key !== "signal" && key !== "expectedRevision")) throw failure("invalid-request");
      ({ signal, expectedRevision } = options);
      if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) throw failure("invalid-request");
      if (signal !== undefined && (typeof signal?.throwIfAborted !== "function" || typeof signal.aborted !== "boolean")) throw failure("invalid-request");
      signal?.throwIfAborted();
    } catch (error) { return Promise.reject(error); }
    const operation = tail.then(async () => {
      signal?.throwIfAborted();
      if (expectedRevision !== undefined && expectedRevision !== snapshot.revision) throw failure("stale-enablement");
      if (snapshot.enabled[feature] === enabled) return snapshot;
      if (snapshot.revision === Number.MAX_SAFE_INTEGER) throw unavailable();
      const record = freezeRecord({ revision: snapshot.revision + 1, enabled: { ...snapshot.enabled, [feature]: enabled }, finalAnswer: snapshot.finalAnswer });
      // Public global.set cannot retract a started commit. Publish its durable outcome even if the caller aborts later.
      try { await global.set(record); } catch { throw unavailable(); }
      snapshot = snapshotOf(record);
      notify();
      return snapshot;
    });
    tail = operation.then(() => {}, () => {});
    return operation;
  }
  function setFinalAnswer(enabled, options = {}) {
    if (closing) return Promise.reject(unavailable());
    let signal, expectedRevision;
    try {
      if (typeof enabled !== "boolean") throw failure("invalid-enabled");
      if (!options || typeof options !== "object" || Array.isArray(options)
        || Object.keys(options).some(key => key !== "signal" && key !== "expectedRevision")) throw failure("invalid-request");
      ({ signal, expectedRevision } = options);
      if (expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) throw failure("invalid-request");
      if (signal !== undefined && (typeof signal?.throwIfAborted !== "function" || typeof signal.aborted !== "boolean")) throw failure("invalid-request");
      signal?.throwIfAborted();
    } catch (error) { return Promise.reject(error); }
    const operation = tail.then(async () => {
      signal?.throwIfAborted();
      if (expectedRevision !== undefined && expectedRevision !== snapshot.revision) throw failure("stale-enablement");
      if (snapshot.finalAnswer === enabled) return snapshot;
      if (snapshot.revision === Number.MAX_SAFE_INTEGER) throw unavailable();
      const record = freezeRecord({ revision: snapshot.revision + 1, enabled: { ...snapshot.enabled }, finalAnswer: enabled });
      try { await global.set(record); } catch { throw unavailable(); }
      snapshot = snapshotOf(record);
      notify();
      return snapshot;
    });
    tail = operation.then(() => {}, () => {});
    return operation;
  }
  return Object.freeze({
    getSnapshot: () => snapshot,
    set,
    setFinalAnswer,
    subscribe(listener) {
      if (closing) throw unavailable();
      if (typeof listener !== "function") throw failure("invalid-request");
      listeners.add(listener); return () => listeners.delete(listener);
    },
    close() {
      closing = true;
      disposal ??= tail.then(async () => {
        try { await domain.close(); } catch { throw unavailable(); } finally { listeners.clear(); }
      });
      return disposal;
    },
  });
}
