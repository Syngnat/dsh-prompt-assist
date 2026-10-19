import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {createFast} from "../client-fast-core.js";
import * as policy from "../policy.js";

const require = createRequire(new URL("../package.json", import.meta.url));
const React = require("react");
const {renderToStaticMarkup} = require("react-dom/server");
const selected = {provider: "cpa", model: "gpt-6.1-sol"};
const source = value => ({getSnapshot: () => value, subscribe: () => () => {}});

/** Capture the actual registered component, not a duplicate of its visibility logic. */
function toggleFixture(fastState, selection = selected, options = {}) {
  const registered = [];
  let dictionary;
  let writes = 0;
  let catalogReads = 0;
  const bundle = createFast(name => {assert.equal(name, "react"); return React;});
  const ctx = {effect: callback => callback(), locale: {register: (ns, value) => {dictionary = value[options.locale ?? "en"]; return () => {}; }},
    connection: {rpc: {call: async () => ({ok: true, value: {revision: 0, configured: [], authorized: [], effective: []}})}},
    slots: {inject: (name, callback) => callback(), register: (declaration, Component) => {registered.push({declaration, Component}); return () => {}; }}};
  bundle.apply(ctx);
  const item = registered.find(value => value.declaration.name === "conversation.input.right" && value.declaration.id === "local-openai-fast");
  assert.ok(item, "the production FastToggle must be registered");
  const props = {sessionId: "test-session", fastSource: source(fastState),
    prioritySource: options.prioritySource,
    modelSource: source({next: selection}), sessionSource: source(options.session ?? {}),
    useAccess: permission => {assert.equal(permission, "commands/execute"); return options.allowed !== false;},
    remote: {commands: {execute: async () => {writes++; throw new Error("SSR must not execute commands");}},
      session: {modelCatalog: async () => {catalogReads++; return {ok: true, value: {default: selected}};}}},
    refresh: async () => {}, t: key => dictionary[key] ?? key};
  return {bundle, Component: item.Component, props, render: () => renderToStaticMarkup(React.createElement(item.Component, props)),
    get writes() {return writes;}, get catalogReads() {return catalogReads;}};
}

test("SSR keeps an unapproved GPT route visible as a disabled Fast switch", () => {
  const fixture = toggleFixture({enabled: true, providers: ["openai"]});
  const html = fixture.render();
  assert.match(html, /<button[^>]*role="switch"/);
  assert.match(html, /<button[^>]*aria-disabled="true"/);
  assert.doesNotMatch(html, /<button[^>]*\sdisabled/);
  assert.match(html, /aria-checked="false"/);
  assert.equal(fixture.writes, 0);
  assert.equal(fixture.catalogReads, 0, "SSR must not run the model catalog effect");
});

test("a blocked Fast control explains itself without relying on a disabled tooltip", () => {
  const fixture = toggleFixture({enabled: true, providers: ["openai"]});
  const html = fixture.render();
  // Chromium suppresses title on disabled buttons: the reason lives on the wrapper instead.
  assert.match(html, /<span class="local-openai-fast" title="[^"]*Provider ID: cpa/);
  assert.doesNotMatch(html, /<button[^>]*\stitle=/);
});

test("the blocked reason names the provider by display name and exact id when both are known", () => {
  const fixture = toggleFixture({enabled: true, providers: ["openai"]}, selected, {
    prioritySource: source({status: "ready", revision: 1, authorized: [], effective: ["openai"], names: {"cpa": "CPA"}}),
  });
  assert.match(fixture.render(), /title="[^"]*Provider ID: CPA \(cpa\)/);
});

test("a profile authorization reaches the Fast control even when the wire predates it", () => {
  const fixture = toggleFixture({enabled: false, providers: ["openai"]}, selected, {
    prioritySource: source({status: "ready", revision: 1, authorized: ["cpa"], effective: ["openai", "cpa"]}),
  });
  const html = fixture.render();
  assert.match(html, /<button[^>]*role="switch"/);
  assert.doesNotMatch(html, /<button[^>]*aria-disabled="true"/);
  assert.equal(fixture.writes, 0);
});

test("an idle or failed priority snapshot never grants access", () => {
  for (const status of ["idle", "error"]) {
    const fixture = toggleFixture({enabled: false, providers: ["openai"]}, selected, {
      prioritySource: source({status, revision: null, authorized: [], effective: []}),
    });
    assert.match(fixture.render(), /<button[^>]*aria-disabled="true"/);
  }
});

const pure = () => createFast(() => {throw new Error("Pure helpers must not require React");});const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const settle = async operation => {await Promise.allSettled([operation]);};

for (const [name, wire] of [["missing", undefined], ["null", null], ["legacy true", true], ["legacy false", false]]) {
  test("SSR keeps GPT visible and disabled with " + name + " projection", () => {
    const fixture = toggleFixture(wire);
    const html = fixture.render();
    assert.match(html, /<button[^>]*role="switch"/);
    assert.match(html, /<button[^>]*aria-disabled="true"/);
    assert.doesNotMatch(html, /<button[^>]*\sdisabled/);
    assert.match(html, /aria-checked="false"/);
    assert.equal(fixture.writes, 0);
    assert.equal(fixture.catalogReads, 0);
  });
}

test("SSR approved GPT route stays usable and reflects the real wire boolean", () => {
  for (const enabled of [false, true]) {
    const fixture = toggleFixture({enabled, providers: ["cpa"]});
    const html = fixture.render();
    assert.match(html, /<button[^>]*role="switch"/);
    assert.ok(html.includes("aria-checked=\"" + String(enabled) + "\""));
    assert.doesNotMatch(html, /<button[^>]*aria-disabled="true"/);
    assert.equal(fixture.writes, 0);
  }
});

test("SSR denied command permission remains visible but cannot write", () => {
  const fixture = toggleFixture({enabled: false, providers: ["cpa"]}, selected, {allowed: false});
  assert.match(fixture.render(), /<button[^>]*role="switch"[^>]*aria-disabled="true"/);
  assert.equal(fixture.writes, 0);
});

test("SSR still hides non-OpenAI, subagent, and removed-session Fast controls", () => {
  const wire = {enabled: true, providers: ["cpa"]};
  assert.equal(toggleFixture(wire, {...selected, model: "deepseek-chat"}).render(), "");
  assert.equal(toggleFixture(wire, selected, {session: {subagent: true}}).render(), "");
  assert.equal(toggleFixture(wire, selected, {session: {removed: true}}).render(), "");
});

test("presentation explains a missing allowlist or legacy projection without enabling", () => {
  const bundle = pure();
  for (const wire of [undefined, null, true, false]) {
    assert.deepEqual(bundle.derivePresentation(wire, selected, null),
      {visible: true, enabled: false, eligible: false, reason: "loading"});
  }
});

test("presentation exposes GPT without granting an unapproved provider", () => {
  const bundle = pure();
  for (const providers of [[], ["openai"]]) {
    assert.deepEqual(bundle.derivePresentation({enabled: true, providers}, selected, null),
      {visible: true, enabled: false, eligible: false, reason: "unsupported-provider"});
  }
});

test("a fully admitted route alone may reflect enabled=true", () => {
  const bundle = pure();
  for (const enabled of [false, true]) {
    assert.deepEqual(bundle.derivePresentation({enabled, providers: ["cpa"]}, selected, null),
      {visible: true, enabled, eligible: true, reason: "ready"});
  }
});

test("selection absence and unsupported models cannot inherit an enabled state", () => {
  const bundle = pure(), wire = {enabled: true, providers: ["cpa"]};
  assert.deepEqual(bundle.derivePresentation(wire, null, null),
    {visible: false, enabled: false, eligible: false, reason: "no-selection"});
  for (const model of ["deepseek-chat", "claude-sonnet-4", "not-gpt-6", "gptish"]) {
    assert.deepEqual(bundle.derivePresentation(wire, {...selected, model}, selected),
      {visible: false, enabled: false, eligible: false, reason: "unsupported-model"});
  }
  assert.deepEqual(bundle.derivePresentation(wire, null, selected),
    {visible: true, enabled: true, eligible: true, reason: "ready"});
});

test("shared model-family matching preserves existing case-insensitive behavior", () => {
  assert.equal(typeof policy.isOpenAIModel, "function");
  const bundle = pure(), wire = {enabled: true, providers: ["cpa"]};
  for (const model of ["gpt-6.1-sol", "GPT-6.1-SOL", "chatgpt-4o-latest", "CHATGPT-4O-LATEST", "codex", "CODEX-MAX", "o1", "O3-MINI"]) {
    assert.equal(policy.isOpenAIModel(model), true, model);
    assert.equal(policy.isOpenAISelection({...selected, model}, ["cpa"]), true, model);
    assert.equal(bundle.derivePresentation(wire, {...selected, model}, null).eligible, true, model);
  }
  for (const model of ["deepseek-chat", "claude-sonnet-4", "custom-gpt"]) assert.equal(policy.isOpenAIModel(model), false, model);
});

test("the Host provider allowlist stays explicit and case-sensitive", () => {
  assert.equal(policy.isOpenAISelection(selected), false);
  assert.equal(policy.isOpenAISelection(selected, ["openai"]), false);
  assert.equal(policy.isOpenAISelection({...selected, provider: "CPA"}, ["cpa"]), false);
  assert.equal(policy.isOpenAISelection(selected, ["cpa"]), true);
});

test("hydration shares one pending Promise and marks ready only after success", async () => {
  const bundle = pure(), ready = new WeakSet(), binding = {}, ack = deferred();
  const reads = [];
  const refresh = id => {reads.push(id); return ack.promise;};
  const first = bundle.hydrateSession(ready, binding, "same", refresh);
  const second = bundle.hydrateSession(ready, binding, "same", refresh);
  assert.equal(typeof first?.then, "function");
  assert.equal(first, second);
  assert.equal(ready.has(binding), false);
  assert.deepEqual(reads, ["same"]);
  ack.resolve(); await first;
  assert.equal(ready.has(binding), true);
  await bundle.hydrateSession(ready, binding, "same", refresh);
  assert.deepEqual(reads, ["same"]);
});

test("failed hydration never poisons ready and the same binding can retry", async () => {
  const bundle = pure(), ready = new WeakSet(), binding = {};
  let reads = 0;
  const refresh = () => {reads++; return reads === 1 ? Promise.reject(new Error("offline")) : Promise.resolve();};
  await settle(bundle.hydrateSession(ready, binding, "session", refresh));
  assert.equal(ready.has(binding), false);
  await bundle.hydrateSession(ready, binding, "session", refresh);
  assert.equal(reads, 2);
  assert.equal(ready.has(binding), true);
});

test("resolved transport does not mark ready while its projection remains absent", async () => {
  const bundle = pure(), ready = new WeakSet(), binding = {};
  let projectionReady = false, reads = 0;
  const refresh = async () => {reads++;};
  const isReady = () => projectionReady;
  await bundle.hydrateSession(ready, binding, "session", refresh, isReady);
  assert.equal(ready.has(binding), false);
  projectionReady = true;
  await bundle.hydrateSession(ready, binding, "session", refresh, isReady);
  assert.equal(ready.has(binding), true);
  await bundle.hydrateSession(ready, binding, "session", refresh, isReady);
  assert.equal(reads, 2);
});

test("a reconnect binding refreshes independently even for the same session id", async () => {
  const bundle = pure(), ready = new WeakSet(), a = {}, b = {}, reads = [];
  const refresh = async id => {reads.push(id);};
  const first = bundle.hydrateSession(ready, a, "same", refresh);
  const second = bundle.hydrateSession(ready, b, "same", refresh);
  assert.notEqual(first, second);
  await Promise.all([first, second]);
  assert.deepEqual(reads, ["same", "same"]);
  assert.equal(ready.has(a), true); assert.equal(ready.has(b), true);
});

function fakeClock() {
  let id = 0;
  const pending = new Map(), delays = [], cleared = [];
  return {
    setTimer(callback, delay) {const key = ++id; pending.set(key, {callback, delay}); delays.push(delay); return key;},
    clearTimer(key) {cleared.push(key); pending.delete(key);},
    runNext() {const item = pending.entries().next().value; assert.ok(item, "a bounded retry must be scheduled"); pending.delete(item[0]); item[1].callback(); return item[1].delay;},
    get size() {return pending.size;}, delays, cleared,
  };
}
const flush = async () => {for (let i = 0; i < 12; i++) await Promise.resolve();};
function retryWith(clock, options) {
  const create = pure().createHydrationRetry;
  assert.equal(typeof create, "function");
  return create({setTimer: clock.setTimer, clearTimer: clock.clearTimer, ...options});
}

test("bounded retry coalesces starts and recovers from failure then absent projection", async () => {
  const clock = fakeClock(), settled = [];
  let attempts = 0, ready = false;
  const retry = retryWith(clock, {delays: [7, 19], isReady: () => ready,
    attempt: async () => {attempts++; if (attempts === 1) throw new Error("offline"); if (attempts === 3) ready = true;},
    onSettled: value => settled.push(value)});
  const first = retry.start();
  assert.equal(retry.start(), first);
  await flush(); assert.equal(attempts, 1); assert.deepEqual(clock.delays, [7]); assert.deepEqual(settled, []);
  assert.equal(clock.runNext(), 7); await flush();
  assert.equal(attempts, 2); assert.deepEqual(clock.delays, [7, 19]); assert.deepEqual(settled, []);
  assert.equal(clock.runNext(), 19); await flush();
  assert.equal(await first, true); assert.equal(attempts, 3); assert.deepEqual(settled, [true]); assert.equal(clock.size, 0);
  assert.equal(retry.start(), first); assert.deepEqual(settled, [true]); retry.dispose();
});

test("default retry budget exhausts after one attempt plus two deterministic delays", async () => {
  const clock = fakeClock(), settled = []; let attempts = 0;
  const retry = retryWith(clock, {attempt: async () => {attempts++;}, isReady: () => false, onSettled: value => settled.push(value)});
  const done = retry.start(); await flush();
  assert.equal(attempts, 1); assert.deepEqual(clock.delays, [250]);
  clock.runNext(); await flush(); assert.equal(attempts, 2); assert.deepEqual(clock.delays, [250, 1000]);
  clock.runNext(); await flush(); assert.equal(await done, false);
  assert.equal(attempts, 3); assert.equal(clock.size, 0); assert.deepEqual(settled, [false]);
  assert.equal(retry.start(), done); assert.equal(attempts, 3); retry.dispose();
});

test("ready projection still receives the promised initial attempt and one settlement", async () => {
  const clock = fakeClock(), settled = []; let attempts = 0;
  const retry = retryWith(clock, {attempt: async () => {attempts++;}, isReady: () => true, onSettled: value => settled.push(value)});
  const first = retry.start(); assert.equal(await first, true);
  assert.equal(attempts, 1); assert.equal(clock.size, 0); assert.deepEqual(clock.delays, []); assert.deepEqual(settled, [true]);
  assert.equal(retry.start(), first); assert.equal(attempts, 1); retry.dispose();
});

test("an empty retry budget catches a synchronous attempt failure without a timer", async () => {
  const clock = fakeClock(), settled = []; let attempts = 0;
  const retry = retryWith(clock, {delays: [], attempt: () => {attempts++; throw new Error("sync failure");}, isReady: () => false, onSettled: value => settled.push(value)});
  assert.equal(await retry.start(), false); assert.equal(attempts, 1); assert.equal(clock.size, 0); assert.deepEqual(settled, [false]); retry.dispose();
});

test("dispose clears a scheduled retry and resolves without publishing settlement", async () => {
  const clock = fakeClock(), settled = []; let attempts = 0;
  const retry = retryWith(clock, {delays: [9], attempt: async () => {attempts++;}, isReady: () => false, onSettled: value => settled.push(value)});
  const done = retry.start(); await flush(); assert.equal(clock.size, 1);
  retry.dispose(); assert.equal(clock.size, 0); assert.equal(clock.cleared.length, 1);
  assert.equal(await done, false); await flush(); assert.equal(attempts, 1); assert.deepEqual(settled, []);
});

test("dispose ignores a late successful attempt and suppresses all retries", async () => {
  const clock = fakeClock(), ack = deferred(), settled = []; let ready = false, attempts = 0, result = null;
  const retry = retryWith(clock, {attempt: () => {attempts++; return ack.promise;}, isReady: () => ready, onSettled: value => settled.push(value)});
  const done = retry.start(); done.then(value => {result = value;}); await flush();
  retry.dispose(); await flush();
  assert.equal(result, false, "cancellation must settle without waiting for the pending transport");
  ready = true; ack.resolve(); await flush();
  assert.equal(await done, false); assert.equal(attempts, 1); assert.equal(clock.size, 0); assert.deepEqual(settled, []);
});

test('loading explains unknown state without claiming Host Priority was switched off', () => {
  for (const [locale, expected] of [['en', /Existing Host settings are unchanged/], ['zh', /不会更改已保存的 Fast 设置/]]) {
    const fixture = toggleFixture(undefined, selected, {locale});
    const html = fixture.render();
    assert.match(html, expected);
    assert.doesNotMatch(html, /Priority stays off until confirmed|确认前不会开启 Priority/);
    assert.equal(fixture.writes, 0);
  }
});
