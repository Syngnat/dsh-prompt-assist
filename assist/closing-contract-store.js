import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

const failure = code => Object.assign(new Error(code), { code });
const unavailable = () => failure("global-settings-unavailable");
const optional = (ctx, name) => typeof ctx?.get === "function" ? ctx.get(name) : ctx?.[name];
const freeze = value => Object.freeze({ revision: value.revision, finalAnswer: value.finalAnswer !== false });

function schemaOf(z) {
  return z.object({
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    finalAnswer: z.boolean(),
  }).strict();
}

function domainName(dir) {
  if (typeof dir !== "string" || !isAbsolute(dir) || dir.includes("\u0000")) throw unavailable();
  const absolute = resolve(dir);
  const canonical = process.platform === "win32" ? absolute.toLowerCase() : absolute;
  return "local_prompt_assist_final_answer_" + createHash("sha256").update(canonical, "utf8").digest("hex");
}

function createStore(domain, global, loaded) {
  let record = loaded, tail = Promise.resolve(), closing = false, disposal;
  const listeners = new Set();
  const notify = () => { for (const listener of [...listeners]) { try { void Promise.resolve(listener(record)).catch(() => {}); } catch {} } };
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
      if (expectedRevision !== undefined && expectedRevision !== record.revision) throw failure("stale-enablement");
      if (record.finalAnswer === enabled) return record;
      if (record.revision === Number.MAX_SAFE_INTEGER) throw unavailable();
      const next = freeze({ revision: record.revision + 1, finalAnswer: enabled });
      try { await global.set(next); } catch { throw unavailable(); }
      record = next; notify(); return record;
    });
    tail = operation.then(() => {}, () => {});
    return operation;
  }
  return Object.freeze({
    getSnapshot: () => record,
    setFinalAnswer,
    subscribe(listener) {
      if (closing) throw unavailable();
      if (typeof listener !== "function") throw failure("invalid-request");
      listeners.add(listener); return () => listeners.delete(listener);
    },
    close() {
      closing = true;
      disposal ??= tail.then(async () => { try { await domain.close(); } catch { throw unavailable(); } finally { listeners.clear(); } });
      return disposal;
    },
  });
}

/**
 * One profile-global switch in its own storage domain. The flags and controls domains keep their
 * strict record shapes so an older build can still read them after a downgrade; this file is simply
 * absent for builds that never wrote it.
 */
export async function openClosingContract(ctx, z) {
  let domain;
  try {
    const facility = optional(ctx, "storageDomain"), profile = optional(ctx, "profileContext");
    if (typeof facility?.open !== "function") throw unavailable();
    const schema = schemaOf(z);
    domain = await facility.open({ name: domainName(profile?.dir), version: 1, global: { schema, initial: freeze({ revision: 0, finalAnswer: true }) }, tables: {} });
    const global = domain?.global;
    if (typeof global?.get !== "function" || typeof global?.set !== "function" || typeof domain.close !== "function") throw unavailable();
    return createStore(domain, global, freeze(schema.parse(global.get())));
  } catch {
    try { await domain?.close(); } catch {}
    throw unavailable();
  }
}
