import test from 'node:test';
import assert from 'node:assert/strict';
import {callAssistModel} from '../assist/model-call.js';

const route = {provider: 'fixture', model: 'fixture', fast: false, metadata: {}};
const prompt = {system: 's', user: 'u'};
const agent = {id: 'stuck-fixture'};
const create = value => ({...value, role: 'user', content: [{type: 'text', text: 'x'}]});

function fixture(stream, extra = {}) {
  return {
    tokenMeter: {estimateMessage: () => 1},
    llm: {
      async prepareCall(config) {
        return {config, context: {contextWindow: 100000}, maxTokens: 1000, stream: typeof stream === 'function' ? stream : () => stream};
      },
      ...extra,
    },
  };
}

/** A provider that accepted the request and then never produces a chunk. */
const stalled = () => ({
  async *[Symbol.asyncIterator]() {
    return {next: () => new Promise(() => {})};
  },
});

const neverEnding = () => ({
  [Symbol.asyncIterator]() {
    return {next: () => new Promise(() => {}), return: async () => ({done: true})};
  },
});

test('a caller cancel interrupts a provider stream that never yields', async () => {
  const controller = new AbortController();
  const call = callAssistModel(fixture(neverEnding), agent, route, prompt, 'enhance', controller.signal, create);
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(call, error => error.name === 'AbortError');
});

test('an expired deadline interrupts a provider stream that never yields', async () => {
  // AbortSignal.timeout keeps its timer unref'd, so hold the loop open while waiting.
  const keepAlive = setTimeout(() => {}, 200);
  const call = callAssistModel(fixture(neverEnding), agent, route, prompt, 'enhance', AbortSignal.timeout(15), create);
  try { await assert.rejects(call, error => error.name === 'TimeoutError'); } finally { clearTimeout(keepAlive); }
});

test('the interrupted stream releases its provider iterator once', async () => {
  let released = 0;
  const stream = {
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise(() => {}),
        return: async () => { released += 1; return {done: true}; },
      };
    },
  };
  const controller = new AbortController();
  const call = callAssistModel(fixture(stream), agent, route, prompt, 'enhance', controller.signal, create);
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(call, error => error.name === 'AbortError');
  assert.equal(released, 1);
});

test('an already aborted signal never dispatches to the provider', async () => {
  let dispatched = 0;
  const ctx = fixture({
    [Symbol.asyncIterator]() { dispatched += 1; return {next: async () => ({done: true})}; },
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(callAssistModel(ctx, agent, route, prompt, 'enhance', controller.signal, create), error => error.name === 'AbortError');
  assert.equal(dispatched, 0);
});
