import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createAssistController} from '../assist/client/controller.js';
import {undoText} from '../assist/client/editor.js';
import {Preview} from '../assist/client/preview.js';
import {css} from '../assist/client/style.js';
import {dictionaries} from '../assist/client/messages.js';

function descendants(element, predicate) {
  if (!React.isValidElement(element)) return [];
  return [
    ...(predicate(element) ? [element] : []),
    ...React.Children.toArray(element.props.children).flatMap(child => descendants(child, predicate)),
  ];
}
const button = (tree, key) => descendants(tree, element => element.type === 'button' && element.props.children === key)[0];
const resultText = tree => descendants(tree, element => element.type === 'pre' && element.props.className === 'lpa-result-text')[0].props.children;

function fixture(original = 'Original draft', inputPatch = {}) {
  let input = {draft: original, draftRev: 7, phase: 'plain', attachmentIds: ['keep'], occurrences: [], ...inputPatch};
  const edits = [], applied = [], notices = [], requests = [];
  const actions = {
    captureInsertion: () => ({start: input.draft.length, end: input.draft.length, draftRev: input.draftRev}),
    insertText(text, span) {
      edits.push({text, span});
      if (span.draftRev !== input.draftRev) return false;
      input = {...input, draft: input.draft.slice(0, span.start) + text + input.draft.slice(span.end), draftRev: input.draftRev + 1};
      return true;
    },
  };
  const runtime = {
    sessionId: 'a', allowed: true, busy: false, dirty: false,
    result: {}, readInput: () => input, setNotice: key => notices.push(key),
  };
  const frame = () => ({
    sessionId: runtime.sessionId, input, qaId: '1:2', busy: runtime.busy, paused: false, routeKey: 'route',
    settings: {enhance: {enabled: true, followSession: true}, suggest: {enabled: true, followSession: true}},
  });
  const controller = createAssistController({
    actions: () => actions, publish: state => { runtime.result = state; }, requestId: () => String(requests.length),
    send: (_action, _sessionId, payload, signal, onText) => new Promise(resolve => requests.push({payload, signal, onText, resolve})),
  });
  runtime.controller = controller;
  controller.observe(frame());
  return {
    runtime, controller, actions, edits, applied, notices, requests,
    get input() { return input; },
    render: (t = key => key) => Preview({runtime, actions, t, onApplied: value => applied.push(value)}),
    changeInput(patch) { input = {...input, ...patch}; },
    reply(text, patch = {}) {
      const request = requests.at(-1);
      request.resolve({feature: request.payload.feature, original: request.payload.draft, draftRev: request.payload.draftRev, qaId: request.payload.qaId, text, ...patch});
    },
  };
}

test('actual newlines survive streaming, final preview, whole-draft replacement and undo', async t => {
  const original = 'Review D:\\repo\\client.js using grok-4-1-fast-reasoning.';
  const text = [
    'Review `D:\\repo\\client.js` using `grok-4-1-fast-reasoning`.',
    '',
    'Requirements:',
    '1. Preserve existing changes.',
    '2. Keep this code unchanged:',
    '```js',
    'const path = "D:\\\\repo\\\\client.js";',
    'console.log(path);',
    '```',
    '',
    '- Report failures.',
    '- Preserve the model ID `gpt-5`.',
  ].join('\n');
  const f = fixture(original);
  t.after(() => f.controller.dispose());
  const attachmentIds = f.input.attachmentIds;
  const work = f.controller.generate('enhance');
  const partial = text.slice(0, text.indexOf('```js'));
  f.requests[0].onText(partial);
  let tree = f.render();
  assert.equal(resultText(tree), partial);
  assert.ok(renderToStaticMarkup(tree).includes(partial));
  assert.equal(button(tree, 'apply').props.disabled, true);
  assert.equal(button(tree, 'copy').props.disabled, true);
  assert.ok(button(tree, 'cancel'));
  button(tree, 'apply').props.onClick();
  assert.equal(f.edits.length, 0);
  f.reply(text);
  await work;
  tree = f.render();
  assert.equal(resultText(tree), text);
  assert.ok(renderToStaticMarkup(tree).includes(text.replaceAll('"', '&quot;')));
  assert.match(css, /\.lpa-preview pre\{[^}]*white-space:pre-wrap/);
  assert.equal(button(tree, 'apply').props.disabled, false);
  button(tree, 'apply').props.onClick();
  assert.equal(f.input.draft, text);
  assert.equal(f.input.attachmentIds, attachmentIds);
  assert.equal(f.edits.length, 1);
  assert.deepEqual(f.edits[0].span, {start: 0, end: original.length, draftRev: 7});
  assert.equal(f.applied.length, 1);
  assert.equal(f.runtime.result.preview, null);
  assert.equal(undoText(f.applied[0], () => f.input, f.actions).ok, true);
  assert.equal(f.input.draft, original);
  assert.equal(f.input.attachmentIds, attachmentIds);
  assert.equal(f.requests.length, 1);
});

for (const [name, patch] of [
  ['text changed', {draft: 'Edited while preview was visible'}],
  ['same text with a newer revision', {draftRev: 8}],
]) {
  test(`apply handler rejects stale input: ${name}`, async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    const work = f.controller.generate('enhance');
    f.reply('Rewritten\nrequirements');
    await work;
    const tree = f.render();
    f.changeInput(patch);
    const draft = f.input.draft;
    button(tree, 'apply').props.onClick();
    assert.equal(f.input.draft, draft);
    assert.equal(f.edits.length, 0);
    assert.equal(f.applied.length, 0);
    assert.deepEqual(f.notices, ['stale']);
  });
}

for (const [name, inputPatch, receiptPatch, livePatch, text] of [
  ['captured references', {occurrences: [{label: 'file'}]}, {}, {}, 'Rewritten text'],
  ['captured command', {claim: {}}, {}, {}, 'Rewritten text'],
  ['structured receipt', {}, {structured: true}, {}, 'Rewritten text'],
  ['new live reference', {}, {}, {occurrences: [{label: 'file'}]}, 'Rewritten text'],
  ['new live command', {}, {}, {claim: {}}, 'Rewritten text'],
  ['reference placeholder', {}, {}, {}, 'Rewritten\uFFFCtext'],
  ['private reference marker', {}, {}, {}, 'Rewritten\uE100text'],
]) {
  test(`apply handler preserves structured protection: ${name}`, async t => {
    const f = fixture('Original draft', inputPatch);
    t.after(() => f.controller.dispose());
    const work = f.controller.generate('enhance');
    f.reply(text, receiptPatch);
    await work;
    const tree = f.render();
    if (inputPatch.occurrences || inputPatch.claim || receiptPatch.structured) {
      assert.equal(button(tree, 'apply').props.disabled, true);
    }
    f.changeInput(livePatch);
    button(tree, 'apply').props.onClick();
    assert.equal(f.input.draft, 'Original draft');
    assert.equal(f.edits.length, 0);
    assert.equal(f.applied.length, 0);
    assert.deepEqual(f.notices, ['structured']);
  });
}

test('preview and an already captured apply handler cannot apply across sessions', async t => {
  const f = fixture();
  t.after(() => f.controller.dispose());
  const work = f.controller.generate('enhance');
  f.reply('Rewritten text');
  await work;
  const tree = f.render();
  f.runtime.sessionId = 'b';
  assert.equal(f.render(), null);
  button(tree, 'apply').props.onClick();
  assert.equal(f.edits.length, 0);
  assert.equal(f.applied.length, 0);
});

test('finalized exact echo is non-actionable and its apply handler leaves the draft unchanged', async t => {
  const original = 'Review the implementation.\nPreserve existing changes.';
  const f = fixture(original);
  t.after(() => f.controller.dispose());
  const work = f.controller.generate('enhance');
  f.reply(original);
  await work;
  const tree = f.render();
  assert.equal(button(tree, 'apply').props.disabled, true);
  const status = descendants(tree, element => element.props.role === 'status');
  assert.ok(status.some(element => element.props.children === 'enhanceUnchanged'));
  assert.equal(button(tree, 'copy').props.disabled, false);
  assert.ok(button(tree, 'dismiss'));
  button(tree, 'apply').props.onClick();
  assert.equal(f.input.draft, original);
  assert.equal(f.input.draftRev, 7);
  assert.equal(f.edits.length, 0);
  assert.equal(f.applied.length, 0);
  assert.equal(f.runtime.result.preview.text, original);
  assert.deepEqual(f.notices, []);
  assert.equal(f.requests.length, 1);
});

test('CRLF and outer whitespace echoes are blocked without changing the returned text', async t => {
  const original = 'First requirement.\nSecond requirement.';
  const text = ' \r\nFirst requirement.\r\nSecond requirement.\r\n\t';
  const f = fixture(original);
  t.after(() => f.controller.dispose());
  const work = f.controller.generate('enhance');
  f.reply(text);
  await work;
  const tree = f.render();
  assert.equal(resultText(tree), text);
  assert.equal(button(tree, 'apply').props.disabled, true);
  button(tree, 'apply').props.onClick();
  assert.equal(f.input.draft, original);
  assert.equal(f.edits.length, 0);
  assert.equal(f.applied.length, 0);
});

for (const [name, text] of [
  ['punctuation', 'Review code. Report risks!'],
  ['slight paraphrase', 'Inspect code. Report risks.'],
  ['requirement line breaks', 'Review code.\nReport risks.'],
  ['numbered requirements', '1. Review code.\n2. Report risks.'],
  ['paragraph and code formatting', 'Review code.\r\n\r\n```text\r\nReport risks.\r\n```'],
]) {
  test(`finalized enhancement with ${name} remains applicable verbatim`, async t => {
    const f = fixture('Review code. Report risks.');
    t.after(() => f.controller.dispose());
    const work = f.controller.generate('enhance');
    f.reply(text);
    await work;
    const tree = f.render();
    assert.equal(resultText(tree), text);
    assert.equal(button(tree, 'apply').props.disabled, false);
    assert.equal(descendants(tree, element => element.props.children === 'enhanceUnchanged').length, 0);
    button(tree, 'apply').props.onClick();
    assert.equal(f.input.draft, text);
    assert.equal(f.edits[0].text, text);
    assert.equal(f.applied.length, 1);
    assert.equal(f.requests.length, 1);
  });
}

test('an echo during streaming is classified only when enhancement finishes', async t => {
  const original = 'Review the implementation.';
  const f = fixture(original);
  t.after(() => f.controller.dispose());
  const work = f.controller.generate('enhance');
  f.requests[0].onText(original);
  const partial = f.render();
  assert.equal(partial.props['aria-busy'], true);
  assert.equal(button(partial, 'apply').props.disabled, true);
  assert.equal(button(partial, 'copy').props.disabled, true);
  assert.ok(button(partial, 'cancel'));
  assert.equal(descendants(partial, element => element.props.children === 'enhanceUnchanged').length, 0);
  f.reply(original);
  await work;
  const final = f.render();
  assert.equal(final.props['aria-busy'], false);
  assert.ok(descendants(final, element => element.props.children === 'enhanceUnchanged').length);
  assert.equal(button(final, 'apply').props.disabled, true);
  assert.equal(button(final, 'copy').props.disabled, false);
  assert.ok(button(final, 'dismiss'));
});

test('streaming echo still cancels and ignores late text and final receipt', async t => {
  const f = fixture();
  t.after(() => f.controller.dispose());
  const work = f.controller.generate('enhance');
  f.requests[0].onText(f.input.draft);
  button(f.render(), 'cancel').props.onClick();
  assert.equal(f.requests[0].signal.aborted, true);
  f.requests[0].onText('Late rewrite');
  f.reply('Late rewrite');
  assert.equal(await work, false);
  assert.equal(f.runtime.result.preview, null);
  assert.equal(f.edits.length, 0);
  assert.equal(f.applied.length, 0);
  assert.equal(f.requests.length, 1);
});

test('suggestion streaming stays hidden and finalized suggestions remain acceptable', async t => {
  const f = fixture('', {attachmentIds: []});
  t.after(() => f.controller.dispose());
  const work = f.controller.generate('suggest');
  f.requests[0].onText('Partial suggestion');
  assert.equal(f.runtime.result.preview, null);
  const text = 'What should I verify next?\nInclude failure cases.';
  f.reply(text, {outcome: 'suggestion'});
  await work;
  const tree = f.render();
  assert.equal(resultText(tree), text);
  assert.equal(button(tree, 'accept').props.disabled, false);
  assert.equal(descendants(tree, element => element.props.children === 'enhanceUnchanged').length, 0);
  button(tree, 'accept').props.onClick();
  assert.equal(f.input.draft, text);
  assert.equal(f.applied.length, 1);
});

test('exact echo handling applies only to enhancement previews', () => {
  const f = fixture();
  const text = 'What should I verify next?';
  f.runtime.result.preview = {sessionId: 'a', feature: 'suggest', original: text, text, snapshot: {structured: false}};
  const tree = f.render();
  assert.equal(button(tree, 'accept').props.disabled, false);
  assert.equal(descendants(tree, element => element.props.children === 'enhanceUnchanged').length, 0);
  f.controller.dispose();
});

for (const [locale, patterns] of [
  ['zh', [/模型返回了相同文本/, /未产生有效改写/, /草稿保持不变/, /其他模型/, /调整要求/]],
  ['en', [/model returned the same text/, /no effective rewrite/, /draft is unchanged/, /another model/, /adjust your requirements/]],
]) {
  test(`unchanged enhancement shows a localized neutral status in ${locale}`, async t => {
    const f = fixture();
    t.after(() => f.controller.dispose());
    const work = f.controller.generate('enhance');
    f.reply(f.input.draft);
    await work;
    const tree = f.render(key => dictionaries[locale][key]);
    const status = descendants(tree, element => element.props.role === 'status');
    assert.equal(status.length, 1);
    assert.equal(status[0].props.className, 'lpa-note');
    for (const pattern of patterns) assert.match(status[0].props.children, pattern);
    const html = renderToStaticMarkup(tree);
    assert.doesNotMatch(html, /enhanceUnchanged|lpa-success/);
    assert.equal(f.input.draftRev, 7);
    assert.equal(f.applied.length, 0);
  });
}
