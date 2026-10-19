import test from 'node:test';
import assert from 'node:assert/strict';
import {callAssistModel} from '../assist/model-call.js';
import {buildAssistPrompt} from '../assist/prompts.js';

function fixture(chunks) {
  let calls = 0;
  const ctx = {
    tokenMeter: {estimateMessage: () => 10},
    llm: {async prepareCall(config) {
      calls++;
      return {config, context: {contextWindow: 10000}, async *stream() {
        for (const text of chunks) yield {type: 'text-delta', index: 0, text};
        yield {type: 'finish', reason: {kind: 'stop'}};
      }};
    }},
  };
  return {ctx, get calls() {return calls;}};
}
const agent = {id: 'enhance-format-fixture'};
const route = {provider: 'fixture', model: 'fixture', fast: false};
const message = value => ({...value, role: 'user', id: 'fixture-message'});

test('enhancement Host preserves real paragraph, list and code newlines across arbitrary streaming chunks', async () => {
  const chunks = ['存在两个问题：\r', '\n\r\n1. 原文回显。\r\n', '2. 缺少分段。\r\n\r\n', '保留代码：\n```js\n', 'if (ok) {\n  run();\n}\n', '```'];
  const expected = chunks.join(''), observed = [], f = fixture(chunks);
  const prompt = buildAssistPrompt('enhance', '原文：复述，没有换行。');
  const result = await callAssistModel(f.ctx, agent, route, prompt, 'enhance', undefined, message, text => observed.push(text));
  assert.equal(result.text, expected);
  assert.deepEqual(observed, chunks.map((_, index) => chunks.slice(0, index + 1).join('')));
  assert.equal(f.calls, 1, 'formatting does not introduce a second generation');
  assert.equal(JSON.parse(prompt.user).draft, '原文：复述，没有换行。');
});

test('an exact enhancement echo reaches the result unchanged without an automatic paid retry', async () => {
  const original = '只改按钮文字，不要调整布局。', f = fixture([original]);
  const result = await callAssistModel(f.ctx, agent, route, buildAssistPrompt('enhance', original), 'enhance', undefined, message);
  assert.equal(result.text, original);
  assert.equal(f.calls, 1);
});
