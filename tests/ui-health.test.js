import test from 'node:test';
import assert from 'node:assert/strict';
import { createFastViews } from '../projection-v2.js';
import { createUiHealth } from '../ui-health.js';

test('wire publishes the complete Host allowlist while Fast is off', () => {
  const providers = ['openai', 'openai-codex', 'cpa'];
  const view = createFastViews(providers);
  const off = view({ enabled: false });
  assert.deepEqual(off.providers, providers);
  assert.equal(off.enabled, false);
  providers.push('untrusted');
  assert.equal(off.providers.includes('untrusted'), false);
  assert.strictEqual(view({ enabled: false, pending: {} }), off);
  assert.equal(view({ enabled: true }).enabled, true);
});

test('mount diagnostics are scoped to the invoking session and do not change preference', () => {
  const health = createUiHealth();
  const agent = { id: 'a' };
  const data = { version: '1.0.2', visible: true, checked: false, x: 900, y: 800, width: 60, height: 28 };
  assert.equal(health.report({ agent, rawInput: JSON.stringify(data) }).kind, 'success');
  assert.deepEqual(health.read(agent), data);
  assert.equal(health.read({ id: 'b' }), null);
});

test('invalid diagnostics never overwrite a successful mount report', () => {
  const health = createUiHealth();
  const agent = { id: 'a' };
  const data = { version: '1.0.2', visible: true, checked: false, x: 0, y: 0, width: 60, height: 28 };
  health.report({ agent, rawInput: JSON.stringify(data) });
  assert.equal(health.report({ agent, rawInput: '{}' }).kind, 'error');
  assert.equal(health.report({ agent, rawInput: 'x'.repeat(1025) }).kind, 'error');
  assert.deepEqual(health.read(agent), data);
});
