import test from 'node:test';
import assert from 'node:assert/strict';
import { installFastBridge } from '../bridge.js';

/**
 * Reverse integration: the wire, not the name, decides. A gateway provider can be authorized for
 * every route it serves; only the routes whose final segment is a Priority family may ever carry
 * service_tier. This test drives the real bridge with the real resolver and inspects the payload
 * the adapter would send upstream.
 */
function adapterClass() {
  return class TestAdapter {
    modelOf(snapshot) { return snapshot.model; }
    async *streamWithSnapshot(options, snapshot) {
      const result = snapshot.models.streamSimple(snapshot.model, options.context, options.sdkOptions);
      yield await result;
    }
  };
}

function request(provider, id, api) {
  const body = Object.freeze({ model: id, input: [{ role: 'user', content: 'probe' }] });
  const model = Object.freeze({ provider, id, api });
  const models = Object.freeze({
    async streamSimple(actualModel, _context, options = {}) {
      assert.strictEqual(actualModel, model);
      return options.onPayload ? await options.onPayload(body, actualModel) : body;
    },
  });
  return Object.freeze({
    body,
    snapshot: Object.freeze({ model, models }),
    options: Object.freeze({ provider, model: id, sessionId: 'session-1', context: Object.freeze({}), sdkOptions: Object.freeze({}) }),
  });
}

async function send(providers, provider, model, { api = 'openai-responses', enabled = true } = {}) {
  const Adapter = adapterClass();
  let checks = 0;
  const dispose = installFastBridge(Adapter, () => { checks += 1; return enabled; }, providers);
  try {
    const adapter = new Adapter();
    const fixture = request(provider, model, api);
    const payload = await (async () => {
      const values = [];
      for await (const value of adapter.streamWithSnapshot(fixture.options, fixture.snapshot)) values.push(value);
      return values[0];
    })();
    return { payload, checks, body: fixture.body };
  } finally { dispose(); }
}

const tier = payload => payload.service_tier;

test('a gateway grant never accelerates other families behind the same provider', async () => {
  for (const model of ['cpa/glm-5.3-flash', 'cpa/deepseek-v4.1-flash', 'glm-5.3-flash', 'qwen3-max']) {
    const { payload, checks, body } = await send(['magpie'], 'magpie', model);
    assert.equal(checks, 0, model + ': the session preference must not even be consulted');
    assert.strictEqual(payload, body, model + ': the SDK body must pass through untouched');
    assert.equal(tier(payload), undefined, model);
  }
});

test('the reported route injects only once the gateway itself is authorized', async () => {
  const denied = await send(['openai', 'openai-codex'], 'magpie', 'cpa/gpt-6.1-sol');
  assert.equal(tier(denied.payload), undefined);
  assert.equal(denied.checks, 0);

  const allowed = await send(['magpie'], 'magpie', 'cpa/gpt-6.1-sol');
  assert.equal(tier(allowed.payload), 'priority');
  assert.equal(allowed.payload.model, 'cpa/gpt-6.1-sol', 'the namespaced ID must reach the upstream unchanged');
  assert.equal(tier(allowed.body), undefined, 'frozen SDK input must not be mutated');
});

test('a family grant covers OpenAI routes but leaves Grok needing verification', async () => {
  const grants = [{ provider: 'magpie', family: 'openai' }];
  assert.equal(tier((await send(grants, 'magpie', 'cpa/gpt-6.1-sol')).payload), 'priority');
  assert.equal(tier((await send(grants, 'magpie', 'cpa/grok-4.7')).payload), undefined);
  assert.equal(tier((await send(grants, 'magpie', 'cpa/glm-5.3-flash')).payload), undefined);
});

test('a model-scoped grant authorizes exactly that route', async () => {
  const grants = [{ provider: 'magpie', model: 'cpa/gpt-6.1-sol' }];
  assert.equal(tier((await send(grants, 'magpie', 'cpa/gpt-6.1-sol')).payload), 'priority');
  assert.equal(tier((await send(grants, 'magpie', 'cpa/gpt-6.2-sol')).payload), undefined);
  assert.equal(tier((await send(grants, 'other', 'cpa/gpt-6.1-sol')).payload), undefined);
});

test('a non-OpenAI API shape fails closed instead of injecting an unsupported field', async () => {
  await assert.rejects(() => send(['magpie'], 'magpie', 'cpa/gpt-6.1-sol', { api: 'anthropic-messages' }),
    /does not use a supported OpenAI API/u);
});

test('live authorization is re-read for every request', async () => {
  let grants = ['magpie'];
  const providers = () => grants;
  assert.equal(tier((await send(providers, 'magpie', 'cpa/gpt-6.1-sol')).payload), 'priority');
  grants = [];
  assert.equal(tier((await send(providers, 'magpie', 'cpa/gpt-6.1-sol')).payload), undefined);
});

test('an off preference still wins over a ready route', async () => {
  const { payload, checks } = await send(['magpie'], 'magpie', 'cpa/gpt-6.1-sol', { enabled: false });
  assert.equal(checks, 1, 'the route is admitted, so the preference is consulted');
  assert.equal(tier(payload), undefined);
});
