import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePinIds, pinIdsForSections, togglePinnedProvider,
  readPinnedProviders, writePinnedProviders,
} from '../assist/client/model-pin-store.js';
import {focusOrderFor, modelRowId, providerRowKey, splitSections} from '../assist/client/model-picker.js';

const snapshot = {
  status: 'ready', pending: null,
  current: {provider: 'openai', model: 'gpt-6-astra'},
  groups: [
    {id: 'opencode-cpa', models: [{id: 'a'}, {id: 'b'}, {id: 'c'}]},
    {id: 'openai', name: 'OpenAI', models: [{id: 'gpt-6-astra'}]},
    {id: 'xiaomi-token-plan-cn', models: [{id: 'mimo'}]},
  ],
};

test('pin normalization keeps only unique non-empty strings in stored order', () => {
  assert.deepEqual(normalizePinIds(['openai', 'openai', '', null, 7, 'xiaomi-token-plan-cn']), ['openai', 'xiaomi-token-plan-cn']);
  assert.deepEqual(normalizePinIds('openai'), []);
  assert.deepEqual(normalizePinIds(null), []);
});

test('stored pins intersect the current catalog and keep the stored order', () => {
  assert.deepEqual(pinIdsForSections(['xiaomi-token-plan-cn', 'gone', 'openai'], snapshot.groups), ['xiaomi-token-plan-cn', 'openai']);
  assert.deepEqual(pinIdsForSections(['gone'], snapshot.groups), []);
  assert.deepEqual(pinIdsForSections(null, snapshot.groups), []);
});

test('split keeps quick providers expanded on top and collapses the rest', () => {
  const all = splitSections(snapshot, []);
  assert.deepEqual(all.hero.map(group => group.id), ['opencode-cpa', 'openai', 'xiaomi-token-plan-cn']);
  assert.deepEqual(all.collapsed, []);
  const split = splitSections(snapshot, ['openai', 'xiaomi-token-plan-cn']);
  assert.deepEqual(split.hero.map(group => group.id), ['openai', 'xiaomi-token-plan-cn']);
  assert.deepEqual(split.collapsed.map(group => group.id), ['opencode-cpa']);
  assert.deepEqual(split.pins, ['openai', 'xiaomi-token-plan-cn']);
});

test('toggling a pinned provider appends or removes by identity', () => {
  let pins = [];
  pins = togglePinnedProvider('openai', pins);
  assert.deepEqual(pins, ['openai']);
  pins = togglePinnedProvider('openai', pins);
  assert.deepEqual(pins, []);
});

test('pin storage round-trips through an injected storage and survives bad data', () => {
  const values = new Map();
  const storage = {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value)};
  writePinnedProviders(['openai', 7, 'openai'], storage);
  assert.deepEqual(readPinnedProviders(storage), ['openai']);
  values.set('local-prompt-assist:model-pinned-providers', '{broken');
  assert.deepEqual(readPinnedProviders(storage), []);
  assert.deepEqual(readPinnedProviders(undefined), []);
});

test('the top-level focus order lists quick models then collapsed provider rows', () => {
  const order = focusOrderFor(snapshot, ['openai'], null);
  assert.deepEqual(order, [modelRowId({id: 'openai'}, snapshot.groups[1].models[0]), providerRowKey('opencode-cpa'), providerRowKey('xiaomi-token-plan-cn')]);
  assert.deepEqual(focusOrderFor(snapshot, [], null), [
    modelRowId({id: 'opencode-cpa'}, snapshot.groups[0].models[0]),
    modelRowId({id: 'opencode-cpa'}, snapshot.groups[0].models[1]),
    modelRowId({id: 'opencode-cpa'}, snapshot.groups[0].models[2]),
    modelRowId({id: 'openai'}, snapshot.groups[1].models[0]),
    modelRowId({id: 'xiaomi-token-plan-cn'}, snapshot.groups[2].models[0]),
  ]);
});

test('the submenu focus order opens with the back row and only that provider', () => {
  const order = focusOrderFor(snapshot, ['openai'], 'openai');
  assert.deepEqual(order, ['back', modelRowId({id: 'openai'}, snapshot.groups[1].models[0])]);
  assert.deepEqual(focusOrderFor(snapshot, ['openai'], 'opencode-cpa'), [
    'back',
    modelRowId({id: 'opencode-cpa'}, snapshot.groups[0].models[0]),
    modelRowId({id: 'opencode-cpa'}, snapshot.groups[0].models[1]),
    modelRowId({id: 'opencode-cpa'}, snapshot.groups[0].models[2]),
  ]);
  assert.deepEqual(focusOrderFor(snapshot, ['openai'], 'gone'), []);
  assert.deepEqual(focusOrderFor({...snapshot, pending: {provider: 'openai', model: 'gpt-6-astra'}}, ['openai'], 'openai'), []);
});
