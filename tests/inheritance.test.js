import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIFastService } from '../service.js';
import { installFastBridge } from '../bridge.js';

function fixture() {
  const agents = new Map();
  const states = new Map();
  const parents = new Map();
  const make = (id, parent, enabled = false, explicit = false) => {
    const agent = { id, session: { id } };
    agents.set(id, agent);
    states.set(id, { enabled, explicit });
    if (parent) parents.set(id, parent);
    return agent;
  };
  const root = make('root', null, true, true);
  const child = make('child', root);
  const grandchild = make('grandchild', child);
  const other = make('other', null);
  const ctx = {
    agents: {
      list: () => [...agents.values()], get: id => agents.get(id),
      isOwnedBy: (id, parent) => parents.get(id) === parent,
    },
    sessionProjections: {
      stateOf: session => states.get(session.id),
      snapshot: () => ({ values: { modelSelection: { next: { provider: 'cpa', model: 'gpt-6.1-sol', reasoningEffort: 'max' } } } }),
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'cpa', model: 'gpt-6.1-sol' }) },
  };
  return { ctx, root, child, grandchild, other, states, service: new OpenAIFastService(ctx, ['cpa'], key => key) };
}

test('OpenAI children and grandchildren inherit their live parent’s Fast preference', () => {
  const { service, root, child, grandchild } = fixture();
  assert.equal(service.enabled(root), true);
  assert.equal(service.enabled(child), true);
  assert.equal(service.enabled(grandchild), true);
});

test('parent changes reach an existing child on its next request without copying state', () => {
  const { service, states, child } = fixture();
  states.get('root').enabled = false;
  assert.equal(service.enabled(child), false);
  states.get('root').enabled = true;
  assert.equal(service.enabled(child), true);
  assert.equal(states.get('child').enabled, false);
});

test('an explicit child override is respected; unrelated root conversations do not inherit', () => {
  const { service, states, child, grandchild, other } = fixture();
  states.set('child', { enabled: false, explicit: true });
  assert.equal(service.enabled(child), false);
  assert.equal(service.enabled(grandchild), false);
  assert.equal(service.enabled(other), false);
});

test('child request body carries Priority while reasoning is unchanged', async () => {
  const { service, ctx, child } = fixture();
  const body = Object.freeze({ model: 'gpt-6.1-sol', reasoning: Object.freeze({ effort: 'max' }) });
  class Adapter {
    modelOf() { return { api: 'openai-responses' }; }
    async *streamWithSnapshot(options, snapshot) {
      yield await snapshot.models.streamSimple(this.modelOf(), {}, {});
    }
  }
  const models = { streamSimple: async (_model, _context, options) => options.onPayload ? options.onPayload(body, {}) : body };
  const dispose = installFastBridge(Adapter, id => service.enabled(ctx.agents.get(id)), ['cpa']);
  try {
    const stream = new Adapter().streamWithSnapshot({ sessionId: child.id, provider: 'cpa', model: 'gpt-6.1-sol' }, { models });
    const { value } = await stream.next();
    assert.equal(value.service_tier, 'priority');
    assert.strictEqual(value.reasoning, body.reasoning);
    await stream.return();
  } finally { dispose(); }
});

test('Fast does not invent or rewrite reasoning.effort, including an upstream none', async () => {
  const { priorityPayload } = await import('../policy.js');
  for (const effort of ['none', 'low', 'medium', 'high', 'xhigh', 'max']) {
    const body = Object.freeze({ model: 'gpt-6.1-sol', reasoning: Object.freeze({ effort }) });
    const fast = priorityPayload(body);
    assert.strictEqual(fast.reasoning, body.reasoning);
    assert.equal(fast.reasoning.effort, effort);
    assert.equal(fast.service_tier, 'priority');
  }
  assert.equal(Object.hasOwn(priorityPayload({ model: 'gpt-6.1-sol' }), 'reasoning'), false);
});
