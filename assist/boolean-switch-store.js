import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";

const failure = code => Object.assign(new Error(code), { code });
const unavailable = () => failure("global-settings-unavailable");
const optional = (ctx, name) => typeof ctx?.get === "function" ? ctx.get(name) : ctx?.[name];
const freezeRecord = (field, value) => Object.freeze({ revision: value.revision, [field]: value[field] !== false });

function schemaOf(z, field) {
  return z.object({
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    [field]: z.boolean(),
  }).strict();
}

function domainName(dir, prefix) {
  if (typeof dir !== "string" || !isAbsolute(dir) || dir.includes("\u0000")) throw unavailable();
  const absolute = resolve(dir);
  const canonical = process.platform === "win32" ? absolute.toLowerCase() : absolute;
  return prefix + createHash("sha256").update(canonical, "utf8").digest("hex");
}

function createStore(domain, global, loaded, field) {
  let record = loaded, tail = Promise.resolve(), closing = false, disposal;
  const listeners = new Set();
  const notify = () => { for (const listener of [...listeners]) { try { void Promise.resolve(listener(record)).catch(() => {}); } catch {} } };
  function set(enabled, options = {}) {
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
      if (record[field] === enabled) return record;
      if (record.revision === Number.MAX_SAFE_INTEGER) throw unavailable();
      const next = freezeRecord(field, { revision: record.revision + 1, [field]: enabled });
      try { await global.set(next); } catch { throw unavailable(); }
      record = next; notify(); return record;
    });
    tail = operation.then(() => {}, () => {});
    return operation;
  }
  return Object.freeze({
    getSnapshot: () => record,
    set,
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
 * One profile-global boolean switch in its own storage domain. Callers keep their wrapper names and
 * revision semantics; each switch owns a separate record so the existing strict shapes stay intact
 * and an older build can still read the domains it knows after a downgrade.
 */
export async function openBooleanSwitch(ctx, z, { prefix, field, initial = true }) {
  let domain;
  try {
    const facility = optional(ctx, "storageDomain"), profile = optional(ctx, "profileContext");
    if (typeof facility?.open !== "function") throw unavailable();
    const schema = schemaOf(z, field);
    domain = await facility.open({
      name: domainName(profile?.dir, prefix), version: 1,
      global: { schema, initial: freezeRecord(field, { revision: 0, [field]: initial }) }, tables: {},
    });
    const global = domain?.global;
    if (typeof global?.get !== "function" || typeof global?.set !== "function" || typeof domain.close !== "function") throw unavailable();
    return createStore(domain, global, freezeRecord(field, schema.parse(global.get())), field);
  } catch {
    try { await domain?.close(); } catch {}
    throw unavailable();
  }
}
