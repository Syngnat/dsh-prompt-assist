import { ASSIST_CHANNEL, PRIORITY_ENDPOINT } from "./identity.js";
import { mergeProviders } from "../policy.js";
export { PRIORITY_ENDPOINT };

const PUBLIC_CODES = new Set(["invalid-request", "invalid-provider", "provider-unknown", "provider-not-openai",
  "consent-required", "configured-provider", "stale-revision", "provider-limit", "global-settings-unavailable"]);
const failure = code => ({ ok: false, error: { code, message: code, details: {} } });
const fields = Object.freeze({ snapshot: ["action"], candidates: ["action"],
  authorize: ["action", "provider", "consent", "expectedRevision"], revoke: ["action", "provider", "expectedRevision"] });
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const optional = (ctx, name) => typeof ctx?.get === "function" ? ctx.get(name) : ctx?.[name];
const displayName = value => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f]/gu, " ").trim().slice(0, 80) : "";

/** Model settings show provider display names, so the authorization lists need them beside the ID. */
async function providerNames(ctx, wanted) {
  try {
    const llm = optional(ctx, "llm");
    if (typeof llm?.listProviders !== "function") return {};
    const entries = await llm.listProviders();
    const names = {};
    for (const entry of Array.isArray(entries) ? entries : []) {
      const id = entry?.id;
      if (!PROVIDER_ID.test(typeof id === "string" ? id : "") || !wanted.has(id)) continue;
      const name = displayName(entry.name);
      // A name identical to the ID adds nothing; the UI already prints the ID.
      if (name && name !== id) names[id] = name;
    }
    return names;
  } catch { return {}; }
}

/** Native Connection authenticates the owner. No tokens, sessions, model calls, or ad-hoc server. */
export function installPriorityRpc(ctx, store, configured) {
  const builtins = Object.freeze(mergeProviders(configured, []));
  const valueOf = async (snapshot, candidates) => {
    const authorized = [...snapshot.authorized];
    const effective = mergeProviders(builtins, authorized);
    const wanted = new Set([...effective, ...(Array.isArray(candidates) ? candidates.map(item => item?.id) : [])]);
    return { revision: snapshot.revision, configured: [...builtins], authorized, effective,
      ...(candidates === undefined ? {} : { candidates }), names: await providerNames(ctx, wanted) };
  };
  async function handle(payload, signal) {
    try {
      signal?.throwIfAborted();
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.action !== "string"
        || !Object.hasOwn(fields, payload.action)
        || Object.keys(payload).some(key => !fields[payload.action].includes(key))) return failure("invalid-request");
      let snapshot, candidates;
      switch (payload.action) {
        case "snapshot": snapshot = store.snapshot(); break;
        case "candidates": candidates = await store.candidates(signal); snapshot = store.snapshot(); break;
        case "authorize": snapshot = await store.authorize(payload.provider, { consent: payload.consent, expectedRevision: payload.expectedRevision, signal }); break;
        case "revoke": snapshot = await store.revoke(payload.provider, { expectedRevision: payload.expectedRevision }); break;
      }
      return { ok: true, value: await valueOf(snapshot, candidates) };
    } catch (error) {
      const code = signal?.aborted || error?.name === "AbortError" ? "cancelled" : error?.name === "TimeoutError" ? "timeout"
        : PUBLIC_CODES.has(error?.code) ? error.code : "global-settings-unavailable";
      return failure(code);
    }
  }
  return ctx.connection.fetch.register({
    path: ASSIST_CHANNEL + "/" + PRIORITY_ENDPOINT, methods: ["POST"], requestBody: "buffered",
    async fetch(request) {
      const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
      const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
      if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply({ error: "invalid-request" }, 415);
      let envelope;
      try { envelope = JSON.parse(await request.text()); } catch { return reply({ error: "invalid-request" }, 400); }
      if (envelope?.type !== "client-request" || typeof envelope.rpcId !== "string" || envelope.rpcId.length > 200
        || envelope.method !== PRIORITY_ENDPOINT) return reply({ error: "invalid-request" }, 400);
      return reply({ type: "server-response", rpcId: envelope.rpcId, result: await handle(envelope.payload, request.signal) });
    },
  });
}
