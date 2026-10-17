import test from "node:test";
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { ADAPTER_PACKAGE, resolveAdapterEntry } from "../adapter-locator.js";

const entry = (...parts) => join(tmpdir(), "DSH Adapter Test", ...parts, "index.js");
function host(resolved = entry("node_modules", "native-adapter")) {
  const calls = [];
  const loader = { async import(specifier) {
    assert.strictEqual(this, loader); calls.push(["import", specifier]);
    return { resolvePluginResource(specifier, parentURL) { calls.push(["resource", specifier, parentURL]); return resolved; } };
  } };
  return { ctx: { loader, baseUrl: pathToFileURL(join(tmpdir(), "profile", "cordis.yml")).href }, calls, loader, resolved };
}

test("Host uses public Loader import and active DSH resource resolver, not entry-id resolve", async () => {
  const f = host();
  f.loader.resolve = () => { throw new Error("entry-id lookup must not resolve packages"); };
  const result = await resolveAdapterEntry(f.ctx, {}, { resolveNode: () => { throw new Error("Host resolution must win"); } });
  assert.equal(result, f.resolved);
  assert.deepEqual(f.calls, [["import", "@deepseek-ai/dsh-app-boot"], ["resource", ADAPTER_PACKAGE, f.ctx.baseUrl]]);
});

test("Context optional get(loader) is authoritative and keeps Loader method receiver", async () => {
  const f = host(), gets = [];
  const ctx = { baseUrl: f.ctx.baseUrl, get(name) { gets.push(name); return name === "loader" ? f.loader : undefined; },
    get loader() { throw new Error("do not bypass optional Context lookup"); } };
  assert.equal(await resolveAdapterEntry(ctx), f.resolved); assert.deepEqual(gets, ["loader"]);
});

test("Desktop ASAR path with spaces and Unicode is preserved without manual installation guesses", async () => {
  const resolved = entry("Harness 空间", "resources", "app.asar", "dsh", "node_modules", "@deepseek-ai", "dsh-llm-pi-ai", "lib");
  const f = host(resolved); assert.equal(await resolveAdapterEntry(f.ctx), resolved);
});

test("explicit path wins without accessing Loader, package resolver or mutating config", async () => {
  const target = entry("override"), providers = Object.freeze(["openai", "custom"]);
  const config = Object.freeze({ adapterEntry: target, providers, modelCapabilities: Object.freeze([]) });
  const ctx = { get() { throw new Error("explicit override must skip discovery"); } };
  assert.equal(await resolveAdapterEntry(ctx, config, { resolveNode: () => { throw new Error("skip fallback"); } }), target);
  assert.strictEqual(config.providers, providers); assert.equal(config.adapterEntry, target);
});

test("explicit local file URL safely round-trips spaces, hash and Unicode", async () => {
  const target = entry("override # 中文");
  assert.equal(await resolveAdapterEntry({}, { adapterEntry: pathToFileURL(target).href }), target);
});

test("relative explicit override retains the previous pathToFileURL cwd semantics", async () => {
  const relative = "custom-adapter/index.js";
  assert.equal(await resolveAdapterEntry({}, { adapterEntry: relative }), resolve(relative));
});

test("invalid explicit override fails instead of silently selecting the default adapter", async () => {
  let calls = 0; const ctx = { get() { calls++; return undefined; } };
  for (const adapterEntry of [undefined, null, "", " ", [], {}, "https://host/adapter.js", "data:text/javascript,export{}", "bad\npath"]) {
    await assert.rejects(resolveAdapterEntry(ctx, { adapterEntry }), { code: "adapter-entry-invalid" });
  }
  assert.equal(calls, 0);
});

test("ordinary Node embedder without Loader uses injected ordinary Node package resolution", async () => {
  const target = entry("node_modules", "@deepseek-ai", "dsh-llm-pi-ai", "lib"), calls = [];
  const result = await resolveAdapterEntry({}, {}, { resolveNode(specifier) { calls.push(specifier); return target; } });
  assert.equal(result, target); assert.deepEqual(calls, [ADAPTER_PACKAGE]);
});

test("unavailable optional Loader supports async Node fallback without a profile assumption", async () => {
  const target = entry("virtual-runtime");
  const ctx = { get(name) { assert.equal(name, "loader"); return undefined; } };
  assert.equal(await resolveAdapterEntry(ctx, {}, { resolveNode: async () => target }), target);
});

test("Host lookup failure is explicit and never falls through to an unrelated Node package copy", async () => {
  const cause = Object.assign(new Error("missing native adapter"), { code: "ERR_MODULE_NOT_FOUND" }); let fallbacks = 0;
  const ctx = { loader: { async import() { return { resolvePluginResource() { throw cause; } }; } } };
  await assert.rejects(resolveAdapterEntry(ctx, {}, { resolveNode() { fallbacks++; return entry("wrong-copy"); } }),
    error => error.code === "adapter-unavailable" && error.cause === cause && /config.adapterEntry/.test(error.message));
  assert.equal(fallbacks, 0);
});

test("missing Host resolver or invalid resource identity fails closed with a helpful code", async () => {
  for (const module of [{}, { resolvePluginResource: () => "relative/path.js" }, { resolvePluginResource: () => "https://host/native.js" }]) {
    await assert.rejects(resolveAdapterEntry({ loader: { import: async () => module } }), { code: "adapter-unavailable" });
  }
  const cause = new Error("module absent");
  await assert.rejects(resolveAdapterEntry({}, {}, { resolveNode: () => { throw cause; } }), error => error.code === "adapter-unavailable" && error.cause === cause);
});

test("shipped patch removes only local adapter location while retaining provider and capability behavior", async () => {
  const patch = await readFile(new URL("../cordis.patch.yml", import.meta.url), "utf8");
  assert.doesNotMatch(patch, /adapterEntry|[A-Z]:[\\/]|app\.asar/);
  assert.match(patch, /id: local-openai-fast/); assert.match(patch, /name:.*@local\/dsh-openai-fast/);
  assert.match(patch, /providers: \[openai, openai-codex, cpa\]/);
  assert.match(patch, /modelCapabilities:/); assert.match(patch, /gpt-6\.1-sol/); assert.match(patch, /\[low, medium, high, xhigh, max\]/);
});

test("both authored Host entry paths use the shared locator and preserve Fast hooks", async () => {
  const [source, fast] = await Promise.all(["host-source.js", "host-v1.0.4.js"].map(name => readFile(new URL(`../${name}`, import.meta.url), "utf8")));
  assert.match(source, /await resolveAdapterEntry\(ctx, config\)/);
  assert.match(source, /await applyFast\(ctx, \{ \.\.\.config, adapterEntry \}\)/);
  assert.match(fast, /await resolveAdapterEntry\(ctx, config\)/);
  assert.match(fast, /installFastBridge/); assert.match(fast, /applyModelCapabilities\(ctx, config\.modelCapabilities/);
  assert.doesNotMatch(source + fast, /[A-Z]:\/Work\/DevTools|resources\/app\.asar/);
});
