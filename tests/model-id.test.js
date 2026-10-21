import test from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_FAMILIES, modelFamily, parseModelId, isOpenAIModel, isGrokModel, isPriorityModel } from '../model-id.js';

test('the family table is the only place a family is declared', () => {
  assert.deepEqual(MODEL_FAMILIES.map(entry => entry.id), ['openai', 'xai']);
  for (const entry of MODEL_FAMILIES) {
    assert.equal(typeof entry.test, 'function');
    assert.equal(Object.isFrozen(entry), true);
  }
  assert.equal(Object.isFrozen(MODEL_FAMILIES), true);
});

test('every family recognizes the same way, with or without a namespace', () => {
  const samples = { openai: 'gpt-6.1-sol', xai: 'grok-4.7' };
  for (const entry of MODEL_FAMILIES) {
    const id = samples[entry.id];
    for (const candidate of [id, 'cpa/' + id, '安和桥/' + id, 'org/xai/' + id.toUpperCase()]) {
      assert.equal(modelFamily(candidate), entry.id, candidate);
      assert.equal(isPriorityModel(candidate), true, candidate);
    }
  }
});

test('the reported bug: a namespaced OpenAI ID is an OpenAI-family route', () => {
  for (const model of ['cpa/gpt-6.1-sol', 'openai/gpt-6.1-sol', '安和桥/GPT-6.1-SOL', 'cpa/o3', 'proxy/chatgpt-4o-latest']) {
    assert.equal(isOpenAIModel(model), true, model);
    assert.equal(isGrokModel(model), false, model);
  }
});

test('flat IDs keep their pre-namespace behavior', () => {
  for (const model of ['gpt-6.1-sol', 'GPT-6.1-SOL', 'chatgpt-4o-latest', 'codex', 'CODEX-MAX', 'o1', 'O3-MINI']) {
    assert.equal(isOpenAIModel(model), true, model);
  }
  for (const model of ['deepseek-chat', 'claude-sonnet-4', 'custom-gpt', 'gptish', 'not-gpt-6', 'o', 'o0']) {
    assert.equal(isOpenAIModel(model), false, model);
  }
  for (const model of ['grok-4.6', 'grok-4.7', 'GROK-4.8', 'grok-10', 'grok-4-1-fast-reasoning']) {
    assert.equal(isGrokModel(model), true, model);
  }
  for (const model of ['grok-3', 'grok-04.7', 'my-grok-4.7', 'grok']) {
    assert.equal(isGrokModel(model), false, model);
  }
});

test('only the final segment names the family', () => {
  // Deliberate: a leading family token that is followed by a slash is a namespace, not a model.
  for (const model of ['grok-4.7/claude-sonnet', 'gpt-4o/deepseek-chat', 'xai/../gpt-4o']) {
    assert.equal(modelFamily(model), 'other', model);
  }
});

test('malformed route IDs never parse', () => {
  const rejected = ['', '/gpt-4o', 'cpa//gpt-6.1-sol', 'cpa/gpt-6.1-sol/', './gpt-4o', 'cpa/../gpt-4o',
    'cpa/./gpt-4o', 'cpa\\gpt-4o', 'cpa/gpt-4o?x=1', 'cpa/gpt-4o#alias', 'cpa /gpt-4o', 'cpa/gpt-4o\nother',
    'cpa\u0000/gpt-4o', 'https://cpa/gpt-4o', 'cpa/ gpt-4o', 42, null, undefined, {}, ['gpt-4o']];
  for (const value of rejected) {
    assert.equal(parseModelId(value), null, JSON.stringify(value));
    assert.equal(modelFamily(value), 'other', JSON.stringify(value));
    assert.equal(isPriorityModel(value), false, JSON.stringify(value));
  }
});

test('parsing preserves the raw ID and exposes immutable segments', () => {
  const parsed = parseModelId('cpa/gpt-6.1-sol');
  assert.equal(parsed.id, 'cpa/gpt-6.1-sol');
  assert.deepEqual([...parsed.segments], ['cpa', 'gpt-6.1-sol']);
  assert.equal(parsed.last, 'gpt-6.1-sol');
  assert.equal(parsed.family, 'openai');
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.segments), true);
});
