import test from 'node:test';
import assert from 'node:assert/strict';
import { applyModelCapabilities } from '../model-capabilities.js';
import { initialInheritedFastState, foldInheritedFastState } from '../projection-v3.js';

const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
const specification = { provider: 'cpa', model: 'gpt-6.1-sol', efforts };
function fixture(previous) {
  const model = { id: 'gpt-6.1-sol', reasoningEfforts: previous, name: 'GPT-6.1-Sol' };
  const value = { providers: { cpa: { apiKeyEnv: 'TEST_CREDENTIAL_REFERENCE', models: [{ id: 'unrelated-model' }, model] } } };
  const writes = [];
  const ctx = {
    llm: { listConfigurableProviders: () => [{ provider: 'cpa', settingsNs: 'actual-owner', settingsPath: ['providers', 'cpa'] }] },
    settings: {
      describe(options) { assert.equal(options.redactSecrets, true); return [{ ns: 'actual-owner', value, revision: 7 }]; },
      async mutate(ns, operations, revision) {
        writes.push({ ns, operations, revision });
        model.reasoningEfforts = operations[0].value;
      },
    },
  };
  return { ctx, model, value, writes };
}

test('repair writes only the exact model capability field through its discovered owner', async () => {
  const { ctx, model, value, writes } = fixture({ off: 'none', high: 'high', max: 'max' });
  const result = await applyModelCapabilities(ctx, [specification]);
  assert.equal(result[0].status, 'updated');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].ns, 'actual-owner');
  assert.equal(writes[0].revision, 7);
  assert.deepEqual(writes[0].operations[0].path, ['providers', 'cpa', 'models', '1', 'reasoningEfforts']);
  assert.deepEqual(model.reasoningEfforts, Object.fromEntries(efforts.map(effort => [effort, effort])));
  assert.equal(value.providers.cpa.apiKeyEnv, 'TEST_CREDENTIAL_REFERENCE');
  assert.equal(value.providers.cpa.models[0].id, 'unrelated-model');
  assert.equal(JSON.stringify(result).includes('TEST_CREDENTIAL_REFERENCE'), false);
});

test('capability repair is idempotent and does not choose a user reasoning effort', async () => {
  const { ctx, writes } = fixture(Object.fromEntries(efforts.map(effort => [effort, effort])));
  assert.equal((await applyModelCapabilities(ctx, [specification]))[0].status, 'unchanged');
  assert.deepEqual(writes, []);
});

test('unconfigured models and invalid effort sets never rewrite provider configuration', async () => {
  const { ctx, writes } = fixture();
  assert.equal((await applyModelCapabilities(ctx, [{ ...specification, model: 'not-found' }]))[0].status, 'not-configured');
  assert.equal((await applyModelCapabilities(ctx, [{ ...specification, efforts: ['none'] }]))[0].status, 'failed');
  assert.deepEqual(writes, []);
});

test('new child preferences inherit until a successful explicit setting is committed', () => {
  let state = initialInheritedFastState({}, 0);
  assert.equal(state.explicit, false);
  state = foldInheritedFastState(state, { type: 'command/run', seq: 0, data: { name: 'openai-fast', args: 'off', commandId: 'a' } });
  state = foldInheritedFastState(state, { type: 'command/done', seq: 1, data: { commandId: 'a', kind: 'success' } });
  assert.equal(state.explicit, true);
  assert.equal(state.enabled, false);
});

test('failed settings and fork-inherited commands do not create explicit overrides', () => {
  let state = initialInheritedFastState({}, 10);
  state = foldInheritedFastState(state, { type: 'command/run', seq: 1, data: { name: 'openai-fast', args: 'on', commandId: 'a' } });
  state = foldInheritedFastState(state, { type: 'command/done', seq: 2, data: { commandId: 'a', kind: 'success' } });
  assert.equal(state.explicit, false);
  assert.equal(state.enabled, false);
});
