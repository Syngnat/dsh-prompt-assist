import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Load only the real bundle's pure module exports. No React, DOM or renderer.
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const source = readFileSync(new URL(`../${manifest.exports['./client']}`, import.meta.url), 'utf8');
let factory;
vm.runInNewContext(source, { window: { __ModuleLoader__: { load(value) { factory = value.factory; } } } });
const bundle = factory(() => { throw new Error('Pure visibility checks must not load React'); });
const selected = { provider: 'cpa', model: 'gpt-6.1-sol' };

test('Host-allowed cpa route stays visible without any Client config', () => {
  const view = bundle.derivePresentation({ enabled: false, providers: ['openai', 'cpa'] }, selected, null);
  assert.equal(view.visible, true);
  assert.equal(view.enabled, false);
});

test('Client config cannot contradict the authoritative Host allowlist', () => {
  const view = bundle.derivePresentation({ enabled: false, providers: ['openai'] }, selected, null, ['cpa']);
  assert.equal(view.visible, true);
  assert.equal(view.eligible, false);
  assert.equal(view.enabled, false);
  assert.equal(view.reason, 'needs-verification');
});

test('published Fast state, rather than object truthiness, controls checked state', () => {
  assert.equal(bundle.derivePresentation({ enabled: true, providers: ['cpa'] }, selected, null).enabled, true);
  assert.equal(bundle.derivePresentation({ enabled: false, providers: ['cpa'] }, selected, null).enabled, false);
});

test('the same visibility path supports blank-session defaults and excludes non-OpenAI models', () => {
  const state = { enabled: false, providers: ['cpa'] };
  assert.equal(bundle.derivePresentation(state, null, selected).visible, true);
  assert.equal(bundle.derivePresentation(state, { provider: 'cpa', model: 'deepseek-chat' }, null).visible, false);
  const loading = bundle.derivePresentation(undefined, selected, null);
  assert.equal(loading.visible, true);
  assert.equal(loading.eligible, false);
  assert.equal(loading.reason, 'loading');
});

test('an already-open session pulls the new projection exactly once, even after rerendering', () => {
  const ready = new WeakSet();
  const binding = {};
  const reads = [];
  const reports = [];
  const refresh = id => { reads.push(id); return Promise.resolve(); };
  const report = data => { reports.push(data); return Promise.resolve(); };
  bundle.hydrateSession(ready, binding, 'current', refresh, report);
  bundle.hydrateSession(ready, binding, 'current', refresh, report);
  assert.deepEqual(reads, ['current']);
  assert.equal(reports.length, 0, 'hydration must not emit diagnostic commands');
});

test('a new binding for the same session refreshes again after reconnect', () => {
  const ready = new WeakSet();
  let reads = 0;
  const refresh = () => { reads += 1; return Promise.resolve(); };
  const report = () => Promise.resolve();
  bundle.hydrateSession(ready, {}, 'same-session', refresh, report);
  bundle.hydrateSession(ready, {}, 'same-session', refresh, report);
  assert.equal(reads, 2);
});
test('the reported Magpie route stays visible and explains itself instead of vanishing', () => {
  const reported = { provider: 'magpie', model: 'cpa/gpt-6.1-sol' };
  const pending = bundle.derivePresentation({ enabled: false, providers: ['openai', 'openai-codex', 'cpa'] }, reported, null);
  assert.equal(pending.visible, true, 'the switch must not vanish on a namespaced OpenAI route');
  assert.equal(pending.enabled, false);
  assert.equal(pending.eligible, false);
  assert.equal(pending.reason, 'needs-verification');
  const ready = bundle.derivePresentation({ enabled: true, providers: ['magpie'] }, reported, null);
  assert.equal(ready.visible, true);
  assert.equal(ready.enabled, true);
  assert.equal(ready.eligible, true);
  assert.equal(ready.reason, 'ready');
});

test('granting the gateway never shows Fast on its other model families', () => {
  for (const model of ['cpa/glm-5.3-flash', 'cpa/deepseek-v4.1-flash', 'glm-5.3-flash']) {
    const view = bundle.derivePresentation({ enabled: true, providers: ['magpie'] }, { provider: 'magpie', model }, null);
    assert.equal(view.visible, false, model);
    assert.equal(view.eligible, false, model);
    assert.equal(view.reason, 'unsupported-model', model);
  }
});
