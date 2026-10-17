import test from 'node:test';
import assert from 'node:assert/strict';
import { installFastBridge, priorityModels } from '../bridge.js';

function adapterClass() {
  return class TestAdapter {
    modelOf(snapshot) { return snapshot.model; }
    async *streamWithSnapshot(options, snapshot) {
      const result = snapshot.models.streamSimple(snapshot.model,
        options.context, options.sdkOptions);
      yield await result;
    }
  };
}

function request(api = 'openai-responses', provider = 'openai') {
  const body = Object.freeze({ model: 'gpt-test', input: [{ role: 'user', content: 'test' }] });
  const context = Object.freeze({ messages: [] });
  const sdkOptions = Object.freeze({ headers: { attribution: 'preserved' }, signal: new AbortController().signal });
  const model = Object.freeze({ provider, id: 'gpt-test', api });
  const models = Object.freeze({
    async streamSimple(actualModel, actualContext, options = {}) {
      assert.strictEqual(actualModel, model);
      assert.strictEqual(actualContext, context);
      assert.strictEqual(options.headers, sdkOptions.headers);
      assert.strictEqual(options.signal, sdkOptions.signal);
      return options.onPayload ? await options.onPayload(body, actualModel) : body;
    },
  });
  return {
    body, snapshot: Object.freeze({ model, models }),
    options: Object.freeze({ provider, model: 'gpt-test', sessionId: 'a', context, sdkOptions }),
  };
}

async function output(adapter, options, snapshot) {
  const values = [];
  for await (const value of adapter.streamWithSnapshot(options, snapshot)) values.push(value);
  return values[0];
}

test('off → on → off controls actual wire payload without modifying frozen inputs', async () => {
  const Adapter = adapterClass();
  const original = Adapter.prototype.streamWithSnapshot;
  let enabled = false;
  const dispose = installFastBridge(Adapter, () => enabled, ['openai']);
  try {
    const adapter = new Adapter();
    const { options, snapshot, body } = request();
    assert.strictEqual(await output(adapter, options, snapshot), body);
    enabled = true;
    const fast = await output(adapter, options, snapshot);
    assert.equal(fast.service_tier, 'priority');
    assert.equal(body.service_tier, undefined);
    assert.strictEqual(fast.input, body.input);
    enabled = false;
    assert.strictEqual(await output(adapter, options, snapshot), body);
  } finally { dispose(); }
  assert.strictEqual(Adapter.prototype.streamWithSnapshot, original);
});

for (const api of ['openai-responses', 'openai-completions', 'openai-codex-responses']) {
  test(`${api}: onPayload survives the common boundary before transport`, async () => {
    const Adapter = adapterClass();
    const dispose = installFastBridge(Adapter, () => true, ['openai']);
    try {
      const { options, snapshot } = request(api);
      assert.equal((await output(new Adapter(), options, snapshot)).service_tier, 'priority');
    } finally { dispose(); }
  });
}

test('two sessions and simultaneous SDK calls never share the flag', async () => {
  const Adapter = adapterClass();
  const dispose = installFastBridge(Adapter, id => id === 'a', ['openai']);
  try {
    const { options, snapshot } = request();
    const [fast, normal] = await Promise.all([
      output(new Adapter(), options, snapshot),
      output(new Adapter(), { ...options, sessionId: 'b' }, snapshot),
    ]);
    assert.equal(fast.service_tier, 'priority');
    assert.equal(normal.service_tier, undefined);
  } finally { dispose(); }
});

test('auxiliary, non-OpenAI, anonymous and unsupported calls do not leak Priority', async () => {
  const Adapter = adapterClass();
  const dispose = installFastBridge(Adapter, () => true, ['openai']);
  try {
    const { options, snapshot } = request();
    for (const changes of [{ purpose: 'compaction' }, { purpose: 'session-title' },
      { sessionId: undefined }, { provider: 'deepseek' }, { model: 'deepseek-chat' }]) {
      assert.equal((await output(new Adapter(), { ...options, ...changes }, snapshot)).service_tier, undefined);
    }
    const other = request('anthropic-messages');
    await assert.rejects(output(new Adapter(), other.options, other.snapshot), /supported OpenAI API/);
  } finally { dispose(); }
});

test('request admission captures the flag; toggling does not mutate an in-flight request', async () => {
  const Adapter = adapterClass();
  let enabled = true;
  const dispose = installFastBridge(Adapter, () => enabled, ['openai']);
  try {
    const { options, snapshot } = request();
    const stream = new Adapter().streamWithSnapshot(options, snapshot);
    enabled = false;
    const first = await stream.next();
    assert.equal(first.value.service_tier, 'priority');
    await stream.return();
    assert.equal((await output(new Adapter(), options, snapshot)).service_tier, undefined);
  } finally { dispose(); }
});

test('existing onPayload callback, receiver identity and method binding are preserved', async () => {
  const body = Object.freeze({ model: 'gpt-test' });
  const target = {
    secret: 7,
    identity() { return this.secret; },
    async streamSimple(model, _context, options) {
      assert.strictEqual(this, target);
      return options.onPayload(body, model);
    },
  };
  const facade = priorityModels(target);
  assert.equal(facade.identity(), 7);
  const result = await facade.streamSimple({}, {}, {
    onPayload: async value => ({ ...value, preserved: true }),
  });
  assert.equal(result.preserved, true);
  assert.equal(result.service_tier, 'priority');
  assert.equal(body.service_tier, undefined);
});

test('bridge refuses incompatible/double installation and cleanup does not clobber another plugin', async () => {
  assert.throws(() => installFastBridge(class {}, () => true, []), /incompatible/);
  const Adapter = adapterClass();
  const dispose = installFastBridge(Adapter, () => true, ['openai']);
  assert.throws(() => installFastBridge(Adapter, () => true, []), /incompatible/);
  const ourWrapper = Adapter.prototype.streamWithSnapshot;
  function later(...args) { return ourWrapper.apply(this, args); }
  Adapter.prototype.streamWithSnapshot = later;
  dispose();
  assert.strictEqual(Adapter.prototype.streamWithSnapshot, later);
  const { options, snapshot } = request();
  assert.equal((await output(new Adapter(), options, snapshot)).service_tier, undefined);
});
