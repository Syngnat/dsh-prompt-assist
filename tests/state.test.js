import test from 'node:test';
import assert from 'node:assert/strict';
import { foldFastState, initialFastState, PROJECTION_KEY } from '../projection.js';
import { isOpenAISelection, priorityPayload } from '../policy.js';
import { OpenAIFastService } from '../service.js';

function event(type, seq, data) { return { type, seq, data }; }
function applyCommand(state, id, action, kind = 'success', seq = 0) {
  return foldFastState(foldFastState(state,
    event('command/run', seq, { commandId: id, name: 'openai-fast', args: ` ${action}` })),
  event('command/done', seq + 1, { commandId: id, kind }));
}

test('new sessions default off; successful own commands replay on/off', () => {
  const state = initialFastState({}, 0);
  assert.equal(state.enabled, false);
  const on = applyCommand(state, 'c1', 'on');
  assert.equal(on.enabled, true);
  assert.equal(applyCommand(on, 'c2', 'off').enabled, false);
  assert.equal(state.enabled, false);
  assert.deepEqual(state.pending, {});
});

test('failed or unpaired commands never enable Fast', () => {
  const off = initialFastState({}, 0);
  assert.equal(applyCommand(off, 'c1', 'on', 'error').enabled, false);
  assert.strictEqual(foldFastState(off,
    event('command/done', 2, { commandId: 'unrelated', kind: 'success' })), off);
  assert.strictEqual(foldFastState(off,
    event('command/run', 3, { commandId: 'c3', name: 'other', args: ' on' })), off);
  assert.strictEqual(foldFastState(off,
    event('assistant/message', 4, {})), off);
});

test('forks do not inherit an enabled setting; subsequent own commands work', () => {
  const off = initialFastState({}, 10);
  assert.equal(applyCommand(off, 'inherited', 'on', 'success', 4).enabled, false);
  assert.equal(applyCommand(off, 'own', 'on', 'success', 10).enabled, true);
});

test('interleaved commands correlate by ID and ignore status reads', () => {
  let state = initialFastState({}, 0);
  state = foldFastState(state, event('command/run', 0, { name: 'openai-fast', commandId: 'a', args: ' on' }));
  state = foldFastState(state, event('command/run', 1, { name: 'openai-fast', commandId: 'b', args: ' off' }));
  state = foldFastState(state, event('command/done', 2, { commandId: 'a', kind: 'success' }));
  assert.equal(state.enabled, true);
  state = foldFastState(state, event('command/done', 3, { commandId: 'b', kind: 'success' }));
  assert.equal(state.enabled, false);
  assert.strictEqual(foldFastState(state, event('command/run', 4,
    { name: 'openai-fast', commandId: 'c', args: ' status' })), state);
});

test('route allowlist precedes model-family detection', () => {
  assert.equal(isOpenAISelection({ provider: 'openai', model: 'gpt-6.1-sol' }), true);
  assert.equal(isOpenAISelection({ provider: 'openai-codex', model: 'gpt-5-codex' }), true);
  assert.equal(isOpenAISelection({ provider: 'openai', model: 'o3' }), true);
  assert.equal(isOpenAISelection({ provider: 'deepseek', model: 'gpt-fake' }), false);
  assert.equal(isOpenAISelection({ provider: 'openai', model: 'deepseek-chat' }), false);
  assert.equal(isOpenAISelection({ provider: 'custom', model: 'gpt-6.1-sol' }), false);
  assert.equal(isOpenAISelection({ provider: 'custom', model: 'gpt-6.1-sol' }, ['custom']), true);
});

test('Priority copies only the wire body; invalid upstream bodies fail', () => {
  const body = Object.freeze({ model: 'gpt-test', input: [], service_tier: 'auto' });
  const result = priorityPayload(body);
  assert.equal(result.service_tier, 'priority');
  assert.equal(body.service_tier, 'auto');
  assert.strictEqual(result.input, body.input);
  assert.throws(() => priorityPayload(null));
  assert.throws(() => priorityPayload([]));
});

function fixture() {
  let state = initialFastState({}, 0);
  let seq = 0;
  const agent = { session: {}, id: 's1' };
  const selection = { provider: 'openai', model: 'gpt-test' };
  const ctx = {
    agentDefaultModel: { currentSelection: () => selection },
    sessionProjections: {
      snapshot: () => ({ values: { modelSelection: { next: selection } } }),
      stateOf: (_session, key) => { assert.equal(key, PROJECTION_KEY); return state; },
    },
    commands: {
      async execute(receiving, line, attachments, signal) {
        assert.strictEqual(receiving, agent);
        assert.deepEqual(attachments, []);
        signal?.throwIfAborted();
        const rawInput = line.slice('/openai-fast'.length);
        const commandId = `c${seq}`;
        state = foldFastState(state, event('command/run', seq++, { commandId, name: 'openai-fast', args: rawInput }));
        const result = service.command({ agent, rawInput });
        state = foldFastState(state, event('command/done', seq++, { commandId, kind: result.kind }));
        return { commandId, result };
      },
    },
  };
  const service = new OpenAIFastService(ctx, ['openai'], key => key);
  return { service, agent, selection };
}

test('tool and UI command share on/off/status semantics without a model call', async () => {
  const { service, agent } = fixture();
  assert.equal((await service.run(agent, 'status')).enabled, false);
  assert.equal((await service.run(agent, 'on')).enabled, true);
  assert.equal((await service.run(agent, 'off')).enabled, false);
  assert.equal((await service.run(agent, 'status')).eligible, true);
});

test('unsupported routes reject enabling but always allow disabling', async () => {
  const { service, agent, selection } = fixture();
  selection.provider = 'deepseek';
  assert.equal(service.status(agent).eligible, false);
  await assert.rejects(service.run(agent, 'on'), /fast.unsupported/);
  assert.equal((await service.run(agent, 'off')).enabled, false);
  await assert.rejects(service.run(agent, 'invalid'), /fast.invalid/);
  await assert.rejects(service.run(undefined, 'on'), /current session/);
});
