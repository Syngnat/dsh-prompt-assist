import { ASSIST_CHANNEL, PRIORITY_ENDPOINT } from "./identity.js";
import { mergeProviders } from "../policy.js";
export { PRIORITY_ENDPOINT };

const PUBLIC_CODES = new Set(["invalid-request", "invalid-provider", "provider-unknown", "provider-not-openai",
  "consent-required", "configured-provider", "stale-revision", "provider-limit", "global-settings-unavailable"]);
const failure = code => ({ ok: false, error: { code, message: code, details: {} } });
const fields = Object.freeze({ snapshot: ["action"], candidates: ["action"],
  authorize: ["action", "provider", "consent", "expectedRevision"], revoke: ["action", "provider", "expectedRevision"] });

/** Native Connection authenticates the owner. No tokens, sessions, model calls, or ad-hoc server. */
export function installPriorityRpc(ctx, store, configured) {
  const builtins = Object.freeze(mergeProviders(configured, []));
  const valueOf = (snapshot, candidates) => ({ revision: snapshot.revision, configured: [...builtins],
    authorized: [...snapshot.authorized], effective: mergeProviders(builtins, snapshot.authorized),
    ...(candidates === undefined ? {} : { candidates }) });
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
      return { ok: true, value: valueOf(snapshot, candidates) };
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
