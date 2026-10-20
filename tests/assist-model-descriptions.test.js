import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {MODEL_DESCRIPTION_PROVENANCE, modelDescription} from '../assist/client/model-descriptions.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const data = JSON.parse(read('../assist/client/model-descriptions-data.json'));
const provenance = JSON.parse(read('../third-party/claude-style/PROVENANCE.json'));
const model = (id, description) => ({id, name: id, description});
const grokZh = '全球最智能的模型之一，支持原生工具使用以及实时搜索功能。';
const grokEn = 'One of the most intelligent models in the world, with native tool use and real-time search.';

test('vendored data and license retain the pinned upstream content and attribution', () => {
  // Git may change line endings on checkout; the upstream files use LF.
  const hash = path => createHash('sha256').update(read(path).replace(/\r\n/g, '\n')).digest('hex');
  assert.equal(hash('../assist/client/model-descriptions-data.json'), 'd815694fb9540e60bc336939d5dc3f87121cc2ce102b14512f5c0492ea1cdd4b');
  assert.equal(hash('../third-party/claude-style/LICENSE'), '15747d9e2ce37fd5670c4351572b10435f03f79d2b333a50be9c84e771f0af7f');
  assert.equal(provenance.data.sha256, hash('../assist/client/model-descriptions-data.json'));
  assert.equal(provenance.upstreamLicense.sha256, hash('../third-party/claude-style/LICENSE'));
  assert.equal(provenance.commit, '33fc20b63d4cbd31cfec98d7952e3c53ec11c832');
  assert.equal(provenance.releaseProvenance.commit, provenance.commit);
  assert.equal(provenance.version, '0.16.3');
  assert.equal(provenance.license, 'MIT');
  assert.equal(provenance.copyright, 'Copyright (c) 2026 Nwflower');
  assert.equal(MODEL_DESCRIPTION_PROVENANCE.sourceUrl, provenance.data.sourceUrl);
  assert.equal(MODEL_DESCRIPTION_PROVENANCE.commit, provenance.commit);
  assert.equal(MODEL_DESCRIPTION_PROVENANCE.version, provenance.version);
  assert.equal(Object.isFrozen(MODEL_DESCRIPTION_PROVENANCE), true);
  assert.equal(data.fallback, 'en');
  assert.equal(data.families.length, 63);
  assert.equal(data.tiers.length, 4);
});

test('Chinese is the default and builtin copy precedes SDK metadata', () => {
  const entry = Object.freeze(model('grok-4.7', 'SDK catalog description'));
  assert.equal(modelDescription('xai', entry), grokZh);
  assert.equal(modelDescription('xai', entry), grokZh);
});

test('English text is copied literally from the upstream family data', () => {
  assert.equal(modelDescription('custom', model('deepseek-v4.1-flash'), 'en'),
    'Asymmetric architecture: more intelligence, less cost.');
  assert.equal(modelDescription('xai', model('grok-4.7'), 'en'), grokEn);
});

test('specific families and the upstream rule order precede generic families and tiers', () => {
  const cases = [
    ['claude-fable-5-1', 'zh', '新一代智能，专为解决最艰深的知识工作和编程难题。'],
    ['claude-sonnet-5', 'en', 'Hybrid reasoning for real-time agents and high-volume work.'],
    ['gpt-5.4-mini', 'zh', '面向编程与专业工作的长上下文模型。'],
    ['gpt-5.4-codex', 'en', 'Optimized for agentic coding in Codex, handling several software tasks in parallel.'],
    ['glm-5.3-flashx', 'zh', 'GLM 5.3 flash的高吞吐版本。'],
    ['qwen-3-235b-a22b', 'zh', '总参大、激活参数少，单位成本低于同规模稠密模型。'],
  ];
  for (const [id, locale, expected] of cases) assert.equal(modelDescription('custom', model(id), locale), expected, id);
});

test('Chinese namespaces, multiple slashes and mixed case retain the model family', () => {
  for (const id of ['安和桥/grok-4.7', 'relay/安和桥/grok-4.7', '安和桥/GROK-4.7']) {
    assert.equal(modelDescription('custom', model(id)), grokZh, id);
    assert.equal(modelDescription('custom', model(id), 'en'), grokEn, id);
  }
  assert.equal(modelDescription('安和桥', model('grok-4.7')), grokZh);
});

test('a model ID family wins before any provider-qualified family', () => {
  // DeepSeek occurs earlier in the table, but is only present in the provider.
  assert.equal(modelDescription('DEEPSEEK', model('GPT-5.4')),
    '面向编程与专业工作的长上下文模型。');
  assert.equal(modelDescription('deepseek', model('安和桥/grok-4.7')), grokZh);
});

test('provider/model family matching covers IDs without their own vendor name', () => {
  assert.equal(modelDescription('MINIMAX', model('abab6.5s-chat'), 'en'),
    'Agentic reasoning, tool use, coding and multimodal input for long-context work.');
  assert.equal(modelDescription('deepseek', model('v4.1-flash')),
    '非对称模型结构，小成本大智能。');
  assert.equal(modelDescription('claude', model('opus-4.7')),
    '面向复杂编程与 AI 智能体的混合推理模型。');
});

test('unclaimed families use genuine tier copy in the original tier order', () => {
  const cases = [
    ['unlisted-mini', 'zh', '响应快、成本低，适合简单或高频任务。'],
    ['unlisted-mini-pro', 'en', 'Fast and cheap, for simple or high-frequency tasks.'],
    ['unlisted-pro', 'zh', '适合复杂或质量优先的任务，成本更高。'],
    ['unlisted-pro', 'en', 'For complex, quality-first work at higher cost.'],
    ['unlisted-a95b', 'en', 'Many total parameters but few active, so it costs less than a dense model of the same size.'],
    ['unlisted-32b', 'en', 'Cheap to serve, or run locally.'],
  ];
  for (const [id, locale, expected] of cases) assert.equal(modelDescription('custom', model(id), locale), expected, id);
});

test('tier rules inspect only the model ID, never the provider or display name', () => {
  const entry = {id: 'unlisted-v1', name: 'Unknown Pro Mini', description: 'SDK catalog description'};
  assert.equal(modelDescription('custom-pro', entry), entry.description);
});

test('locale prefixes resolve before the JSON English fallback', () => {
  for (const locale of ['zh', 'zh-CN', 'zh-Hans', 'zh_Hans']) {
    assert.equal(modelDescription('custom', model('grok-4.7'), locale), grokZh, locale);
  }
  for (const locale of ['en', 'en-US', 'en_US', 'fr-FR', '', null]) {
    assert.equal(modelDescription('custom', model('grok-4.7'), locale), grokEn, String(locale));
  }
});

test('unknown models return SDK metadata verbatim and never infer copy from the name', () => {
  const entry = {id: 'unlisted-v1', name: 'Claude Opus', description: '<b>SDK catalog description</b> & text'};
  assert.equal(modelDescription('custom', entry), entry.description);
  assert.equal(modelDescription(undefined, entry, 'en'), entry.description);
  assert.equal(modelDescription('custom', {name: 'Unknown', description: 'SDK catalog description'}), 'SDK catalog description');
});

test('missing models and undefined or non-string metadata produce an empty string', () => {
  for (const entry of [undefined, null, {}, {name: 'Grok'}, model('unlisted-v1'),
    model('unlisted-v1', null), model('unlisted-v1', 42), model('unlisted-v1', {})]) {
    assert.equal(modelDescription('custom', entry), '');
  }
  assert.equal(modelDescription('grok', undefined), '');
});

test('the resolver imports and resolves offline without calling fetch', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', () => { requests++; throw new Error('Network unavailable'); });
  const offline = await import('../assist/client/model-descriptions.js?offline-test');
  assert.equal(offline.modelDescription('custom', model('安和桥/grok-4.7')), grokZh);
  assert.equal(offline.modelDescription('custom', model('unlisted-v1')), '');
  assert.equal(requests, 0);
});
