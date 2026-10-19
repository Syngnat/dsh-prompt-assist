import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrioritySource, notifyPriorityChanged, onPriorityChanged} from '../assist/client/priority-source.js';

const connectionOf = handler => ({rpc: {call: (...args) => handler(...args)}});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
};

test('a Host snapshot becomes the authoritative authorized list', async () => {
  let calls = 0;
  const source = createPrioritySource(connectionOf(async (channel, endpoint, payload) => {
    calls += 1;
    assert.equal(channel, '/api');
    assert.equal(endpoint, 'local-openai-fast.priority');
    assert.deepEqual(payload, {action: 'snapshot'});
    return {ok: true, value: {revision: 3, configured: ['openai'], authorized: ['syngnat', 'syngnat', 7], effective: ['openai', 'syngnat'],
      names: {openai: 'OpenAI', syngnat: 'Syngnat', bad: 7, ['x'.repeat(70)]: 'too long id'}}};
  }));
  await source.refresh();
  const state = source.getSnapshot();
  assert.equal(state.status, 'ready');
  assert.equal(state.revision, 3);
  assert.deepEqual(state.authorized, ['syngnat']);
  assert.deepEqual(state.effective, ['openai', 'syngnat']);
  // Display names are optional decoration: valid pairs survive, junk never does.
  assert.deepEqual(state.names, {openai: 'OpenAI', syngnat: 'Syngnat'});
  assert.equal(calls, 1);
  source.dispose();
});

test('a snapshot without usable names still reports the authoritative lists', async () => {
  const source = createPrioritySource(connectionOf(async () => ({ok: true,
    value: {revision: 1, configured: ['openai'], authorized: ['proxy'], effective: ['openai', 'proxy'], names: ['not', 'a', 'map']}})));
  await source.refresh();
  assert.deepEqual(source.getSnapshot().authorized, ['proxy']);
  assert.deepEqual(source.getSnapshot().names, {});
  source.dispose();
});

test('a rejected or failed snapshot never claims readiness', async () => {
  const rejected = createPrioritySource(connectionOf(async () => ({ok: false, error: {code: 'global-settings-unavailable'}})));
  await rejected.refresh();
  assert.equal(rejected.getSnapshot().status, 'error');
  assert.deepEqual(rejected.getSnapshot().authorized, []);

  const thrown = createPrioritySource(connectionOf(async () => {throw new Error('offline');}));
  await thrown.refresh();
  assert.equal(thrown.getSnapshot().status, 'error');
  rejected.dispose(); thrown.dispose();
});

test('concurrent refreshes share one request', async () => {
  let calls = 0;
  const pending = deferred();
  const source = createPrioritySource(connectionOf(async () => {calls += 1; return pending.promise;}));
  const first = source.refresh();
  const second = source.refresh();
  pending.resolve({ok: true, value: {revision: 1, configured: [], authorized: ['cpa'], effective: ['cpa']}});
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(source.getSnapshot().authorized, ['cpa']);
  source.dispose();
});

test('a late response after dispose cannot publish', async () => {
  const pending = deferred();
  const source = createPrioritySource(connectionOf(async () => pending.promise));
  const work = source.refresh();
  source.dispose();
  pending.resolve({ok: true, value: {revision: 9, configured: [], authorized: ['late'], effective: ['late']}});
  await work;
  assert.equal(source.getSnapshot().status, 'idle');
  assert.deepEqual(source.getSnapshot().authorized, []);
});

test('authorization notifications reach subscribers and unsubscribe cleanly', () => {
  let seen = 0;
  const off = onPriorityChanged(() => { seen += 1; });
  notifyPriorityChanged();
  notifyPriorityChanged();
  off();
  notifyPriorityChanged();
  assert.equal(seen, 2);
  assert.equal(typeof onPriorityChanged('nope'), 'function');
});
