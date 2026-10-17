import manifest from "../package.json" with { type: "json" };
import { UpdateService, INSTALL_SPEC } from "./service.js";

export const UPDATE_PATH = "/api/local-openai-fast.updates";
const nullable = type => ({ oneOf: [{ type }, { type: "null" }] });
const outputSchema = {
  type: "object", properties: {
    currentVersion: { type: "string" },
    status: { type: "string", enum: ["idle", "current", "update-available", "ahead", "error"] },
    latestVersion: nullable("string"), releaseUrl: nullable("string"), checkedAt: nullable("number"),
    error: { oneOf: [{ type: "null" }, { type: "string", enum: ["network", "timeout", "rate-limited", "not-found", "invalid-response"] }] },
    installSpec: { type: "string", const: INSTALL_SPEC },
  },
  required: ["currentVersion", "status", "latestVersion", "releaseUrl", "checkedAt", "error", "installSpec"], additionalProperties: false,
};

/** One service for the owner-authenticated UI route and the matching agent tool. */
export function installUpdateHost(ctx, options = {}) {
  const service = new UpdateService({ ...options, currentVersion: manifest.version });
  ctx.effect(() => {
    const unregister = ctx.connection.fetch.register({
      path: UPDATE_PATH, methods: ["GET", "POST"], requestBody: "buffered",
      async fetch(request) {
        request.signal.throwIfAborted();
        if (request.method !== "GET" && request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
        const value = request.method === "POST" ? await service.check() : service.status();
        return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
      },
    });
    // Cancel before awaiting route draining, so unload never waits for the network deadline.
    return async () => { service.dispose(); await unregister(); };
  });
  ctx.tools.register({
    name: "prompt_assist_updates",
    description: "Read cached plugin update status without networking, or check GitHub for the latest stable release only when the user explicitly requests an update check. Never installs, downloads release assets, or upgrades anything.",
    parameters: { type: "object", properties: {
      action: { type: "string", enum: ["status", "check"], description: "status reads cached data only; check fetches stable-release metadata from GitHub." },
    }, required: ["action"], additionalProperties: false },
    output: { schema: outputSchema, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
    timeoutMs: 12000, isConcurrencySafe: () => true,
    execute: async (args, exec) => {
      exec?.signal?.throwIfAborted();
      if (args?.action === "status") return service.status();
      if (args?.action === "check") return service.check();
      throw Object.assign(new Error("Invalid update action"), { code: "invalid-action" });
    },
  });
  return service;
}
