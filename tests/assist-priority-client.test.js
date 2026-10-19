import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {dictionaries} from "../assist/client/messages.js";
import {ASSIST_CHANNEL} from "../assist/identity.js";
const require = createRequire(new URL("../package.json", import.meta.url));
const React = require("react");
const {renderToStaticMarkup} = require("react-dom/server");
const {buildSync} = require("esbuild");
let production;
function panel() {
  if (production) return production;
  const built = buildSync({entryPoints: [fileURLToPath(new URL("../assist/client/priority-panel.js", import.meta.url))],
    bundle: true, write: false, platform: "node", format: "cjs", external: ["react"]});
  const module = {exports: {}};
  new Function("require", "module", "exports", built.outputFiles[0].text)(require, module, module.exports);
  return production = module.exports;
}
const state = {revision: 4, configured: ["openai"], authorized: ["proxy"], effective: ["openai", "proxy"],
  names: {openai: "OpenAI", proxy: "Syngnat"}};
const candidate = {id: "partner", name: "Partner endpoint", configured: false, openAIModels: ["gpt-6.1-sol"]};
const render = props => renderToStaticMarkup(React.createElement(panel().PriorityPanelContent, {
  state, candidates: [candidate], consent: false, selected: candidate.id, notice: null, pending: false, t: key => key, ...props}));

test("SSR shows the provider display name beside the authorized id", () => {
  const html = render({});
  // Model settings lead with the display name, so the lists must pair it with the exact id.
  assert.match(html, /<strong>OpenAI<\/strong><code>openai<\/code>/);
  assert.match(html, /<strong>Syngnat<\/strong><code>proxy<\/code>/);
  assert.ok(html.includes("priority.revoke"));
  // Missing, identical or malformed names fall back to the id alone and never break the list.
  const bare = render({state: {revision: 4, configured: ["openai"], authorized: ["proxy"], effective: ["openai", "proxy"]}});
  assert.doesNotMatch(bare, /<strong>OpenAI<\/strong>/);
  assert.match(bare, /<code>openai<\/code>/);
  const junk = render({state: {...state, names: {openai: 42, proxy: "proxy"}}});
  assert.doesNotMatch(junk, /<strong>42<\/strong>/);
  assert.match(junk, /<code>proxy<\/code>/);
});

test("SSR separates built-in and self authorization and refuses non-OpenAI candidates", () => {
  const html = render({candidates: [candidate, {id: "deepseek", name: "Other", configured: false, openAIModels: ["deepseek-chat"]}]});
  // Class tokens may grow (for example a card shell); assert membership, not the exact attribute.
  assert.match(html, /class="[^"]*\blpa-feature\b[^"]*"/);
  assert.match(html, /aria-label="priority.title"/);
  assert.match(html, /priority.configured/);
  assert.match(html, /<code>openai<\/code>/);
  assert.match(html, /<code>proxy<\/code>/);
  assert.equal((html.match(/>priority.revoke<\/button>/g) ?? []).length, 1);
  assert.match(html, /value="partner"/);
  assert.doesNotMatch(html, /value="deepseek"/);
  assert.match(html, /gpt-6\.1-sol/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>priority.authorize<\/button>/);
});

const endpoint = "local-openai-fast.priority";
const ok = value => ({ok: true, value});
const fail = code => ({ok: false, error: {code, message: "private upstream error", details: {path: "not for display"}}});
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
function fakeConnection(handler) {
  const calls = [];
  return {calls, connection: {rpc: {call(channel, method, payload, signal) {
    calls.push({channel, method, payload, signal});
    return Promise.resolve().then(() => handler(payload, signal, calls.length));
  }}}};
}

test("controller initializes snapshot and candidates through the authenticated RPC seat", async () => {
  const io = fakeConnection(payload => ok(payload.action === "candidates" ? {...state, candidates: [candidate]} : state));
  assert.equal(typeof panel().createPriorityController, "function");
  const controller = panel().createPriorityController(io.connection);
  assert.equal(io.calls.length, 0);
  await controller.start();
  assert.deepEqual(io.calls.map(call => call.payload.action), ["snapshot", "candidates"]);
  assert.ok(io.calls.every(call => call.channel === ASSIST_CHANNEL && call.method === endpoint));
  assert.ok(io.calls.every(call => call.signal instanceof AbortSignal));
  assert.deepEqual(controller.getSnapshot().state, state);
  assert.deepEqual(controller.getSnapshot().candidates, [candidate]);
  controller.dispose();
});

for (const [name, props] of [
  ["no candidates", {candidates: [], consent: true}],
  ["missing consent", {consent: false}],
  ["truthy non-boolean consent", {consent: "yes"}],
  ["no selection", {selected: "", consent: true}],
  ["unlisted selection", {selected: "unknown", consent: true}],
  ["pending", {pending: true, consent: true}],
]) {
  test("SSR disables authorize for " + name, () => {
    const html = render(props);
    assert.match(html, /<button[^>]*disabled=""[^>]*>priority.authorize<\/button>/);
    if (!props.candidates?.length && props.candidates) assert.match(html, /priority.noProviderModels/);
  });
}

test("SSR valid candidate and explicit consent enable only the authorization action", () => {
  assert.match(render({consent: true}), /<button(?![^>]*disabled)[^>]*>priority.authorize<\/button>/);
});

test("SSR renders pending, initial loading, and a safe notice", () => {
  assert.match(render({pending: true}), /priority.loading/);
  assert.match(render({state: null, candidates: []}), /priority.loading/);
  assert.match(render({notice: "priority.stale"}), /priority.stale/);
  assert.match(render({state: {...state, authorized: []}}), /priority.none/);
});

test("SSR rejects malformed, built-in, authorized, and no-model candidates", () => {
  const values = [
    {id: "unknown-models", configured: false, openAIModels: []},
    {id: "missing-models", configured: false},
    {id: "deepseek", configured: false, openAIModels: ["deepseek-chat"]},
    {...candidate, id: "openai"}, {...candidate, id: "proxy"},
    {...candidate, id: "configured", configured: true}, {...candidate, id: "../unsafe"},
  ];
  const html = render({candidates: values, selected: "deepseek", consent: true});
  assert.match(html, /priority.allAuthorized/);
  assert.doesNotMatch(html, /<option[^>]*value="(?:deepseek|openai|proxy|configured|unknown-models)/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>priority.authorize<\/button>/);
});

test("SSR escapes provider names and never exposes built-in revoke controls", () => {
  const html = render({state: {...state, authorized: ["openai", "proxy"]},
    candidates: [{...candidate, name: "<img src=x onerror=bad()>"}]});
  assert.doesNotMatch(html, /<img|aria-label="priority.revoke: openai"/);
  assert.match(html, /&lt;img/);
  assert.equal((html.match(/>priority.revoke<\/button>/g) ?? []).length, 1);
});

test("SSR of the real hook component performs no RPC before mounting", () => {
  const io = fakeConnection(() => {throw new Error("SSR RPC is forbidden");});
  const html = renderToStaticMarkup(React.createElement(panel().PriorityPanel, {connection: io.connection, t: key => key}));
  assert.match(html, /priority.loading/);
  assert.equal(io.calls.length, 0);
});

const fixture = async (write, options) => {
  const io = fakeConnection(payload => ["snapshot", "candidates"].includes(payload.action)
    ? ok(payload.action === "candidates" ? {...state, candidates: [candidate]} : state) : write(payload));
  const controller = panel().createPriorityController(io.connection, options);
  await controller.start(); return {io, controller};
};

test("authorize uses exact provider, explicit consent, and the current Host revision", async () => {
  let changed = 0;
  const next = {...state, revision: 5, authorized: ["proxy", "partner"], effective: ["openai", "proxy", "partner"]};
  const {io, controller} = await fixture(() => ok(next), {onChanged: () => {changed++;}});
  assert.equal(await controller.authorize("partner", true), true);
  assert.deepEqual(io.calls[2].payload, {action: "authorize", provider: "partner", consent: true, expectedRevision: 4});
  assert.equal(controller.getSnapshot().state.revision, 5);
  assert.equal(controller.getSnapshot().notice, "priority.saved");
  assert.equal(changed, 1); controller.dispose();
});

test("consent missing or truthy is rejected locally without an RPC", async () => {
  const {io, controller} = await fixture(() => {throw new Error("unexpected write");});
  for (const consent of [undefined, false, 1, "true"]) {
    assert.equal(await controller.authorize("partner", consent), false);
    assert.equal(controller.getSnapshot().notice, "priority.noConsent");
  }
  assert.equal(io.calls.length, 2); controller.dispose();
});

test("unlisted, non-OpenAI, invalid, configured, or already-authorized ids cannot be submitted", async () => {
  const {io, controller} = await fixture(() => {throw new Error("unexpected write");});
  for (const id of ["unregistered", "deepseek", "../unsafe", "openai", "proxy"]) {
    assert.equal(await controller.authorize(id, true), false);
    assert.equal(controller.getSnapshot().notice, "priority.refused");
  }
  assert.equal(io.calls.length, 2); controller.dispose();
});

test("revoke sends only self-authorized ids and calls the projection refresh callback", async () => {
  let changed = 0; const next = {...state, revision: 5, authorized: [], effective: ["openai"]};
  const {io, controller} = await fixture(() => ok(next), {onChanged: () => {changed++;}});
  assert.equal(await controller.revoke("openai"), false);
  assert.equal(await controller.revoke("not-authorized"), false);
  assert.equal(io.calls.length, 2);
  assert.equal(await controller.revoke("proxy"), true);
  assert.deepEqual(io.calls[2].payload, {action: "revoke", provider: "proxy", expectedRevision: 4});
  assert.equal(changed, 1); assert.deepEqual(controller.getSnapshot().state.authorized, []); controller.dispose();
});

for (const [code, notice] of [
  ["consent-required", "priority.noConsent"], ["provider-unknown", "priority.unknownProvider"],
  ["provider-not-openai", "priority.refused"], ["invalid-provider", "priority.refused"],
  ["global-settings-unavailable", "priority.error"], ["save-failed", "priority.error"],
  ["unexpected-internal-error", "priority.error"],
  ["__proto__", "priority.error"], ["constructor", "priority.error"], ["toString", "priority.error"],
]) {
  test("Host refusal " + code + " maps to a safe localized notice", async () => {
    let changed = 0;
    const {controller} = await fixture(() => fail(code), {onChanged: () => {changed++;}});
    assert.equal(await controller.authorize("partner", true), false);
    assert.equal(controller.getSnapshot().notice, notice);
    assert.equal(changed, 0);
    assert.doesNotMatch(render({...controller.getSnapshot(), selected: "partner"}), /private upstream|not for display/);
    controller.dispose();
  });
}

test("stale revision reloads snapshot and candidates but never resubmits consent", async () => {
  let reads = 0, changed = 0; const fresh = {...state, revision: 8};
  const io = fakeConnection(payload => {
    if (payload.action === "authorize") return fail("stale-revision");
    if (payload.action === "snapshot") reads++;
    const current = reads > 1 ? fresh : state;
    return ok(payload.action === "candidates" ? {...current, candidates: [candidate]} : current);
  });
  const controller = panel().createPriorityController(io.connection, {onChanged: () => {changed++;}});
  await controller.start(); assert.equal(await controller.authorize("partner", true), false);
  assert.deepEqual(io.calls.map(call => call.payload.action), ["snapshot", "candidates", "authorize", "snapshot", "candidates"]);
  assert.equal(controller.getSnapshot().state.revision, 8);
  assert.equal(controller.getSnapshot().notice, "priority.stale");
  assert.equal(changed, 0); controller.dispose();
});

test("a failed stale-refresh cannot falsely claim it reloaded successfully", async () => {
  let reads = 0;
  const io = fakeConnection(payload => {
    if (payload.action === "authorize") return fail("stale-revision");
    if (payload.action === "snapshot") reads++;
    return reads > 1 ? fail("global-settings-unavailable") : ok(payload.action === "candidates" ? {...state, candidates: [candidate]} : state);
  });
  const controller = panel().createPriorityController(io.connection);
  await controller.start(); await controller.authorize("partner", true);
  assert.equal(controller.getSnapshot().notice, "priority.error");
  assert.equal(controller.getSnapshot().state, null); controller.dispose();
});

test("pending authorization ignores duplicate submissions and conflicting reload/revoke", async () => {
  const ack = deferred(); const {io, controller} = await fixture(() => ack.promise);
  const first = controller.authorize("partner", true);
  assert.equal(await controller.authorize("partner", true), false);
  assert.equal(await controller.revoke("proxy"), false);
  assert.equal(await controller.reload(), false);
  assert.equal(io.calls.length, 3);
  ack.resolve(ok({...state, revision: 5, authorized: ["proxy", "partner"], effective: ["openai", "proxy", "partner"]}));
  assert.equal(await first, true); controller.dispose();
});

test("unmount aborts a write and ignores its late receipt and callback", async () => {
  const ack = deferred(); let changed = 0, updates = 0;
  const {io, controller} = await fixture(() => ack.promise, {onChanged: () => {changed++;}});
  controller.subscribe(() => updates++);
  const pending = controller.authorize("partner", true), before = updates;
  controller.dispose(); assert.equal(io.calls[2].signal.aborted, true);
  ack.resolve(ok({...state, revision: 5})); await pending;
  assert.equal(updates, before); assert.equal(changed, 0);
  assert.equal(controller.getSnapshot().state.revision, 4);
});

test("StrictMode-style dispose/start prevents the old read from publishing", async () => {
  const oldRead = deferred(); let reads = 0;
  const io = fakeConnection(payload => {
    if (payload.action === "snapshot" && ++reads === 1) return oldRead.promise;
    return ok(payload.action === "candidates" ? {...state, candidates: [candidate]} : state);
  });
  const controller = panel().createPriorityController(io.connection);
  const first = controller.start(); await Promise.resolve();
  controller.dispose(); const second = controller.start(); await second;
  oldRead.resolve(ok({...state, revision: 1})); await first;
  assert.equal(controller.getSnapshot().state.revision, 4);
  assert.equal(controller.getSnapshot().pending, null); controller.dispose();
});

test("both shipped languages contain every Priority key consumed by this module", () => {
  const required = ["title", "scope", "configured", "authorized", "none", "candidates", "noCandidates", "exampleModels",
    "choose", "allAuthorized", "noProviderModels", "visibleModels",
    "consent", "authorize", "revoke", "reload", "loading", "stale", "refused", "noConsent", "saved", "error", "unknownProvider"];
  for (const locale of ["en", "zh"]) {
    for (const key of required) assert.equal(typeof dictionaries[locale]["priority." + key], "string");
    const html = render({consent: true, t: key => dictionaries[locale][key]});
    assert.ok(html.includes(dictionaries[locale]["priority.title"]));
  }
});

for (const model of ["grok-4.6", "grok-4.7", "grok-4.8"]) {
  test(`${model}: SSR admits Grok-only candidates and configured samples while preserving consent and revoke guards`, () => {
    const grok = {id: "xai", name: "xAI only", configured: false, openAIModels: [null, "grok-3", model, "deepseek-chat"]};
    const props = {candidates: [grok], selected: "xai"};
    for (const consent of [undefined, false, 1, "true"]) {
      const html = render({...props, consent});
      assert.match(html, /<option[^>]*value="xai"/);
      assert.ok(html.includes("xAI only (xai)"));
      assert.ok(html.includes("priority.exampleModels: " + model));
      assert.doesNotMatch(html, /grok-3|deepseek-chat/);
      assert.match(html, /<button[^>]*disabled=""[^>]*>priority.authorize<\/button>/);
    }
    assert.match(render({...props, consent: true}), /<button(?![^>]*disabled)[^>]*>priority.authorize<\/button>/);
    const granted = {...state, authorized: ["proxy", "xai"], effective: ["openai", "proxy", "xai"]};
    const authorized = render({...props, state: granted, consent: true});
    assert.doesNotMatch(authorized, /<option[^>]*value="xai"/);
    assert.match(authorized, /aria-label="priority.revoke: xai"/);
    const configured = render({...props, consent: true,
      state: {...state, configured: ["openai", "xai"], effective: ["openai", "xai", "proxy"], names: {...state.names, xai: "xAI only"}},
      candidates: [{...grok, configured: true}]});
    assert.match(configured, /<strong>xAI only<\/strong><code>xai<\/code>/);
    assert.ok(configured.includes("priority.visibleModels: " + model));
    assert.doesNotMatch(configured, /grok-3|deepseek-chat|aria-label="priority.revoke: xai"|<option[^>]*value="xai"/);
  });

  test(`${model}: the Client controller can grant and revoke a Grok-only provider through revisioned owner RPC`, async t => {
    const initial = {revision: 0, configured: ["openai"], authorized: [], effective: ["openai"], names: {xai: "xAI only"}};
    const grok = {id: "xai", name: "xAI only", configured: false, openAIModels: [model]};
    const granted = {...initial, revision: 1, authorized: ["xai"], effective: ["openai", "xai"]};
    const revoked = {...initial, revision: 2};
    const replies = {snapshot: initial, candidates: {...initial, candidates: [grok]}, authorize: granted, revoke: revoked};
    const io = fakeConnection(payload => ok(replies[payload.action]));
    let changed = 0;
    const controller = panel().createPriorityController(io.connection, {onChanged: () => {changed++;}});
    t.after(() => controller.dispose());
    await controller.start();
    assert.deepEqual(controller.getSnapshot().candidates, [grok]);
    assert.deepEqual(controller.getSnapshot().state.authorized, []);
    for (const consent of [undefined, false, 1, "true"]) {
      assert.equal(await controller.authorize("xai", consent), false);
      assert.equal(controller.getSnapshot().notice, "priority.noConsent");
    }
    assert.equal(io.calls.length, 2); assert.equal(changed, 0);
    assert.equal(await controller.authorize("xai", true), true);
    assert.deepEqual(io.calls[2].payload, {action: "authorize", provider: "xai", consent: true, expectedRevision: 0});
    assert.deepEqual(controller.getSnapshot().state, granted); assert.equal(changed, 1);
    assert.equal(await controller.authorize("xai", true), false, "a granted provider cannot be submitted again");
    assert.equal(io.calls.length, 3);
    assert.equal(await controller.revoke("xai"), true);
    assert.deepEqual(io.calls[3].payload, {action: "revoke", provider: "xai", expectedRevision: 1});
    assert.deepEqual(controller.getSnapshot().state, revoked); assert.equal(changed, 2);
    assert.ok(io.calls.every(call => call.channel === ASSIST_CHANNEL && call.method === endpoint));
  });
}
