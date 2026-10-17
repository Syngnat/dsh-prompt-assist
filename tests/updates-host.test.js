import test from "node:test";
import assert from "node:assert/strict";
import semver from "semver";
import manifest from "../package.json" with { type: "json" };
import { installUpdateHost, UPDATE_PATH } from "../updates/host.js";
import { INSTALL_SPEC, RELEASE_API } from "../updates/service.js";

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const latest = semver.inc(manifest.version, "patch");
const release = () => new Response(JSON.stringify({ draft: false, prerelease: false, tag_name: `v${latest}`,
  html_url: `https://github.com/Syngnat/dsh-prompt-assist/releases/tag/v${latest}` }), { headers: { "Content-Type": "application/json" } });
function fixture(t, options = {}, sharedRoutes = new Map()) {
  const effects = [], tools = new Map(), timers = new Map(), calls = []; let id = 0, drain = async () => {};
  const ctx = {
    effect(start) { const stop = start(); effects.push(stop); return stop; },
    connection: { fetch: { register(route) {
      assert.equal(sharedRoutes.has(route.path), false, "exact route must not leak across unload"); sharedRoutes.set(route.path, route);
      let live = true;
      return async () => { if (!live) return; live = false; await drain(); sharedRoutes.delete(route.path); };
    } } },
    tools: { register(definition) {
      assert.equal(tools.has(definition.name), false); tools.set(definition.name, definition);
      const stop = () => tools.delete(definition.name); effects.push(stop); return stop;
    } },
    get webServer() { throw new Error("must use authenticated Connection registry"); },
    get agents() { throw new Error("updates are not session-scoped"); },
    get commands() { throw new Error("checking must not issue commands"); },
    get pluginManager() { throw new Error("checking must not install or upgrade"); },
    get llm() { throw new Error("checking must not call a model"); },
  };
  const service = installUpdateHost(ctx, { clock: () => 5000, setTimer(fn, ms) { const key = ++id; timers.set(key, { fn, ms }); return key; },
    clearTimer(key) { timers.delete(key); }, ...options,
    fetch: async (...args) => { calls.push(args); return options.fetch ? options.fetch(...args) : release(); },
  });
  const dispose = async () => { for (const stop of effects.splice(0).reverse()) await stop?.(); };
  t.after(dispose);
  const request = (method = "GET", input = {}, principal = "owner") => {
    // The real Connection registry performs this admission before calling plugin fetch.
    if (principal !== "owner") return Promise.resolve(new Response(null, { status: 403 }));
    const req = new Request(`http://127.0.0.1${UPDATE_PATH}${input.query ?? ""}`, { method, ...(input.body === undefined ? {} : { body: input.body }), signal: input.signal });
    const route = sharedRoutes.get(UPDATE_PATH);
    return route.fetch(req);
  };
  return { ctx, service, tools, timers, calls, routes: sharedRoutes, dispose, request, drainWith(fn) { drain = fn; },
    get tool() { return tools.get("prompt_assist_updates"); } };
}

test("Host registers one authenticated route and one explicit-action tool without initial network", t => {
  const f = fixture(t, { currentVersion: "99.0.0" });
  assert.equal(f.routes.size, 1); assert.deepEqual(f.routes.get(UPDATE_PATH).methods, ["GET", "POST"]);
  assert.equal(f.routes.get(UPDATE_PATH).requestBody, "buffered");
  assert.equal(f.service.status().currentVersion, manifest.version); assert.equal(f.calls.length, 0); assert.equal(f.timers.size, 0);
  assert.deepEqual(f.tool.parameters.required, ["action"]); assert.equal(f.tool.parameters.additionalProperties, false);
  assert.deepEqual(f.tool.parameters.properties.action.enum, ["status", "check"]);
  assert.match(f.tool.description, /only when the user explicitly requests/); assert.match(f.tool.description, /Never installs/);
  assert.ok(f.tool.description.length < 300); assert.equal(f.tool.isConcurrencySafe({ action: "check" }), true);
});

test("GET and tool status are exactly the same offline snapshot, even with a check query", async t => {
  const f = fixture(t);
  const response = await f.request("GET", { query: "?action=check&sessionId=PRIVATE" });
  const body = await response.json(); assert.deepEqual(body, await f.tool.execute({ action: "status" }));
  assert.deepEqual(body, f.service.status()); assert.equal(body.status, "idle"); assert.equal(body.installSpec, INSTALL_SPEC);
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(f.calls.length, 0); assert.equal(f.timers.size, 0);
});

test("manual UI POST and tool check merge into the same service job and result", async t => {
  const started = deferred(), gate = deferred();
  const f = fixture(t, { fetch: async () => { started.resolve(); await gate.promise; return release(); } });
  const ui = f.request("POST"), tool = f.tool.execute({ action: "check" }); await started.promise;
  assert.equal(f.calls.length, 1); assert.equal(f.timers.size, 1); gate.resolve();
  const uiResponse = await ui, toolResult = await tool;
  assert.deepEqual(await uiResponse.json(), toolResult); assert.equal(toolResult.status, "update-available");
  assert.equal(toolResult.latestVersion, latest); assert.equal(toolResult.checkedAt, 5000);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(await (await f.request()).json(), toolResult);
  assert.deepEqual(await f.tool.execute({ action: "check" }), toolResult); assert.equal(f.calls.length, 1);
});

test("tool rejects absent/unknown actions and pre-cancelled calls without networking", async t => {
  const f = fixture(t);
  for (const args of [undefined, {}, { action: "install" }, { action: "download" }]) {
    await assert.rejects(f.tool.execute(args), { code: "invalid-action" });
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.tool.execute({ action: "check" }, { signal: controller.signal }), { name: "AbortError" });
  await assert.rejects(f.request("POST", { signal: controller.signal }), { name: "AbortError" });
  assert.equal(f.calls.length, 0);
});

test("POST data cannot select an upstream URL or forward session/file/model data", async t => {
  const f = fixture(t);
  const response = await f.request("POST", { body: JSON.stringify({ url: "https://evil.example", sessionId: "PRIVATE_SESSION", files: ["PRIVATE_FILE"], model: "PRIVATE_MODEL" }) });
  const result = await response.json(); assert.equal(result.status, "update-available");
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], RELEASE_API);
  assert.equal(Object.hasOwn(f.calls[0][1], "body"), false);
  assert.deepEqual(Object.keys(f.calls[0][1].headers), ["User-Agent"]);
  assert.doesNotMatch(JSON.stringify([f.calls[0], result]), /PRIVATE_|evil\.example/);
});

test("network failures remain safe direct JSON error states for both callers, not false current", async t => {
  const f = fixture(t, { fetch: async () => new Response("RAW_UPSTREAM_DETAILS", { status: 404 }) });
  const response = await f.request("POST"), state = await response.json();
  assert.equal(response.status, 200); assert.equal(state.status, "error"); assert.equal(state.error, "not-found");
  assert.equal(state.latestVersion, null); assert.equal(state.releaseUrl, null);
  assert.deepEqual(await f.tool.execute({ action: "status" }), state); assert.doesNotMatch(JSON.stringify(state), /RAW_UPSTREAM/);
});

test("unload aborts the request before waiting for authenticated route draining, then unregisters tool", { timeout: 2000 }, async t => {
  const started = deferred(); let signal;
  const f = fixture(t, { fetch: async (_url, options) => { signal = options.signal; started.resolve(); return new Promise(() => {}); } });
  const response = f.request("POST"); await started.promise;
  f.drainWith(async () => { assert.equal(signal.aborted, true, "abort must precede unregister drain"); await response; });
  await f.dispose(); const body = await (await response).json();
  assert.equal(body.status, "error"); assert.equal(body.error, "network");
  assert.equal(f.routes.size, 0); assert.equal(f.tools.size, 0); assert.equal(f.timers.size, 0);
});

test("owned route can be reinstalled after disposal without duplicate exact registration", async t => {
  const routes = new Map(), first = fixture(t, {}, routes);
  await first.dispose(); assert.equal(routes.size, 0);
  const next = fixture(t, {}, routes); assert.equal(routes.size, 1);
  assert.equal((await (await next.request()).json()).status, "idle"); assert.equal(next.calls.length, 0);
});

test("owner registry admission and unsupported methods cannot force a network check", async t => {
  const f = fixture(t);
  assert.equal((await f.request("POST", {}, "anonymous")).status, 403);
  assert.equal((await f.request("PUT")).status, 405); assert.equal(f.calls.length, 0);
  const result = await f.tool.execute({ action: "status" });
  const rendered = f.tool.output.render({ action: "status" }, result);
  assert.deepEqual(JSON.parse(rendered[0].text), result);
  assert.deepEqual([...f.tool.output.schema.required].sort(), Object.keys(result).sort());
});
