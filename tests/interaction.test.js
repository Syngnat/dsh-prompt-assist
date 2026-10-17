import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const client = readFileSync(new URL(`../${manifest.exports['./client']}`, import.meta.url), 'utf8');
const host = readFileSync(new URL(`../${manifest.exports['.']}`, import.meta.url), 'utf8');
let factory;
vm.runInNewContext(client, { window: { __ModuleLoader__: { load(module) { factory = module.factory; } } } });
const bundle = factory(() => { throw new Error('Controller tests must not load React'); });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('production client and host no longer send or register health commands', () => {
  assert.doesNotMatch(client, /props\.report|binding\.session\.command|function controlHealth/);
  assert.doesNotMatch(host, /createUiHealth|health\.report|name:\s*'openai-fast-ui-health'/);
});

test('only this plugin’s command rows are hidden, including old diagnostic rows', () => {
  assert.deepEqual(Array.from(bundle.quietCommandNames), ['openai-fast', 'openai-fast-ui-health']);
  assert.equal(bundle.HiddenFastCommand(), null);
  assert.match(client, /conversation\.chat\.commandview/);
});

test('click feedback is synchronous while exactly one save awaits acknowledgement', async () => {
  const ack = deferred();
  const calls = [];
  const changes = [];
  const controller = bundle.createToggleController({
    initial: false,
    send: value => { calls.push(value); return ack.promise; },
    publish: value => changes.push(value),
    onError: error => { throw error; },
  });
  const saving = controller.toggle();
  assert.equal(changes.at(-1).enabled, true, 'must change before network reply');
  assert.equal(changes.at(-1).pending, true);
  assert.deepEqual(calls, [true]);
  ack.resolve();
  await saving;
  assert.equal(changes.at(-1).pending, false);
  assert.equal(changes.at(-1).enabled, true);
});

test('rapid clicks stay responsive and coalesce to the latest desired state', async () => {
  const ack = deferred();
  const calls = [];
  const changes = [];
  const controller = bundle.createToggleController({
    initial: false,
    send: value => { calls.push(value); return ack.promise; },
    publish: value => changes.push(value), onError: () => {},
  });
  const saving = controller.toggle();
  controller.toggle();
  assert.equal(changes.at(-1).enabled, false);
  controller.toggle();
  assert.equal(changes.at(-1).enabled, true);
  ack.resolve();
  await saving;
  assert.deepEqual(calls, [true], 'on/off/on before the first reply needs one save');
});

test('a rejected save rolls back immediately and reports one error', async () => {
  const error = new Error('save rejected');
  const changes = [];
  const errors = [];
  const controller = bundle.createToggleController({
    initial: false, send: async () => { throw error; },
    publish: value => changes.push(value), onError: value => errors.push(value),
  });
  await controller.toggle();
  assert.equal(changes.at(-1).enabled, false);
  assert.equal(changes.at(-1).pending, false);
  assert.deepEqual(errors, [error]);
});

test('on then off during a save persists the final state in order', async () => {
  const ack = deferred();
  const calls = [];
  const controller = bundle.createToggleController({
    initial: false,
    send: value => { calls.push(value); return calls.length === 1 ? ack.promise : Promise.resolve(); },
    publish: () => {}, onError: () => {},
  });
  const saving = controller.toggle();
  controller.toggle();
  ack.resolve();
  await saving;
  assert.deepEqual(calls, [true, false]);
});
