import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { isPriorityModel, mergeProviders } from "../policy.js";
export { mergeProviders as effectiveProviders } from "../policy.js";

const failure = code => Object.assign(new Error(code), { code });
const unavailable = () => failure("global-settings-unavailable");
const optional = (ctx, name) => typeof ctx?.get === "function" ? ctx.get(name) : ctx?.[name];
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const validProvider = value => typeof value === "string" && value.trim() === value && PROVIDER_ID.test(value);
const snapshotOf = record => Object.freeze({ revision: record.revision, authorized: Object.freeze([...record.providers]) });

function profileDomain(dir) {
  if (typeof dir !== "string" || !isAbsolute(dir) || dir.includes("\u0000")) throw unavailable();
  const absolute = resolve(dir), canonical = process.platform === "win32" ? absolute.toLowerCase() : absolute;
  return "local_prompt_assist_priority_" + createHash("sha256").update(canonical, "utf8").digest("hex");
}

function readRecord(schema, value) {
  const parsed = schema.parse(value);
  if (new Set(parsed.providers).size !== parsed.providers.length) throw unavailable();
  for (const provider of parsed.providers) if (!validProvider(provider)) throw unavailable();
  return Object.freeze({ revision: parsed.revision, providers: Object.freeze([...parsed.providers]) });
}

/** No session migration or automatic discovery grants; only durable, explicitly consented additions. */
export async function openPriorityProviders(ctx, z, configured) {
  let domain;
  try {
    const facility = optional(ctx, "storageDomain"), profile = optional(ctx, "profileContext");
    if (typeof facility?.open !== "function") throw unavailable();
    const schema = z.object({ revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
      providers: z.array(z.string().regex(PROVIDER_ID)).max(32) }).strict();
    const initial = readRecord(schema, { revision: 0, providers: [] });
    domain = await facility.open({ name: profileDomain(profile?.dir), version: 1, global: { schema, initial }, tables: {} });
    const global = domain?.global;
    if (typeof global?.get !== "function" || typeof global?.set !== "function" || typeof domain.close !== "function") throw unavailable();
    return createStore(ctx, domain, global, schema, readRecord(schema, global.get()), mergeProviders(configured, []));
  } catch {
    try { await domain?.close(); } catch {}
    throw unavailable();
  }
}

function checkSignal(signal) {
  if (signal !== undefined && (typeof signal?.throwIfAborted !== "function" || typeof signal.aborted !== "boolean")) throw failure("invalid-request");
  signal?.throwIfAborted();
}

async function registry(ctx, signal) {
  checkSignal(signal);
  try {
    const llm = optional(ctx, "llm");
    if (typeof llm?.listProviders !== "function") throw failure("provider-unknown");
    const entries = await llm.listProviders(); checkSignal(signal);
    if (!Array.isArray(entries)) throw failure("provider-unknown");
    const seen = new Set();
    return { llm, entries: entries.filter(item => {
      if (!validProvider(item?.id) || seen.has(item.id)) return false;
      seen.add(item.id); return true;
    }) };
  } catch { checkSignal(signal); throw failure("provider-unknown"); }
}

async function recognizedModels(llm, provider, signal) {
  checkSignal(signal);
  let models;
  try { models = typeof llm.listModels === "function" ? await llm.listModels(provider) : []; }
  catch { checkSignal(signal); return []; }
  checkSignal(signal);
  if (!Array.isArray(models)) return [];
  const ids = [];
  try {
    for (const model of models) {
      const id = model?.id;
      if (isPriorityModel(id) && !ids.includes(id)) ids.push(id);
      if (ids.length === 8) break;
    }
    return ids;
  } catch { checkSignal(signal); return []; }
}

function createStore(ctx, domain, global, schema, loaded, configured) {
  let snapshot = snapshotOf(loaded), tail = Promise.resolve(), closing = false, disposal;
  const listeners = new Set(), builtins = new Set(configured);
  function notify() {
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try { void Promise.resolve(listener(snapshot)).catch(() => {}); } catch {}
    }
  }
  async function candidates(signal) {
    if (closing) throw unavailable();
    const { llm, entries } = await registry(ctx, signal), values = [];
    for (const entry of entries) {
      const models = await recognizedModels(llm, entry.id, signal);
      if (closing) throw unavailable();
      if (models.length) values.push({ id: entry.id, name: typeof entry.name === "string" ? entry.name : entry.id,
        configured: builtins.has(entry.id), openAIModels: models });
    }
    if (closing) throw unavailable();
    return values;
  }
  function mutate(action, provider, options = {}) {
    if (closing) return Promise.reject(unavailable());
    let signal, expectedRevision;
    try {
      if (!validProvider(provider)) throw failure("invalid-provider");
      if (!options || typeof options !== "object" || Array.isArray(options)
        || Object.keys(options).some(key => !(action === "authorize" ? ["consent", "expectedRevision", "signal"] : ["expectedRevision"]).includes(key))) throw failure("invalid-request");
      if (action === "authorize" && options.consent !== true) throw failure("consent-required");
      if (builtins.has(provider)) throw failure("configured-provider");
      ({ signal, expectedRevision } = options); checkSignal(signal);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw failure("stale-revision");
    } catch (error) { return Promise.reject(error); }
    const operation = tail.then(async () => {
      checkSignal(signal);
      if (expectedRevision !== snapshot.revision) throw failure("stale-revision");
      if (action === "authorize") {
        // Revalidate at the write boundary; a previous candidates response is not authorization.
        const { llm, entries } = await registry(ctx, signal);
        if (!entries.some(entry => entry.id === provider)) throw failure("provider-unknown");
        if (!(await recognizedModels(llm, provider, signal)).length) throw failure("provider-not-openai");
      }
      checkSignal(signal);
      const present = snapshot.authorized.includes(provider);
      if (present === (action === "authorize")) return snapshot;
      if (action === "authorize" && snapshot.authorized.length >= 32) throw failure("provider-limit");
      if (snapshot.revision === Number.MAX_SAFE_INTEGER) throw unavailable();
      let record;
      try {
        record = readRecord(schema, { revision: snapshot.revision + 1, providers: action === "authorize"
          ? [...snapshot.authorized, provider] : snapshot.authorized.filter(id => id !== provider) });
        // Native global.set has no retractable signal. Publish its durable outcome once started.
        await global.set(record);
        record = readRecord(schema, record);
      } catch { throw unavailable(); }
      snapshot = snapshotOf(record); notify(); return snapshot;
    });
    tail = operation.then(() => {}, () => {});
    return operation;
  }
  return Object.freeze({
    snapshot: () => snapshot, candidates,
    authorize: (provider, options) => mutate("authorize", provider, options),
    revoke: (provider, options) => mutate("revoke", provider, options),
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
