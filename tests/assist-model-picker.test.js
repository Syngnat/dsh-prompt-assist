import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  sectionsOf, currentEntry, effectiveEffort, effortRows, effortSelection,
  busyState, loadingState, modelsOf, menuGeometry, orderModelProviders,
  triggerEffortLabel, MODEL_SLOT, MODEL_PICKER_PRIORITY,
  isCurrentModel, modelRowId, focusOrder, failureRows,
} from '../assist/client/model-picker.js';
import {dictionaries} from '../assist/client/messages.js';

const snapshot = {
  status: 'ready', pending: null,
  current: {provider: 'openai', model: 'gpt-6-astra', reasoningEffort: 'high'},
  groups: [
    {id: 'empty', models: []},
    {id: 'opencode-cpa', models: [
      {id: '安和桥/grok-4.7', name: '安和桥/grok-4.7'},
      {id: '安和桥/deepseek-v4.1-flash-free'},
    ]},
    {id: 'openai', name: 'OpenAI', models: [
      {id: 'gpt-6-astra', name: 'GPT-6 Astra', reasoning: {
        defaultEffort: 'medium', efforts: [
          {id: 'low', name: 'Low'}, {id: 'medium', name: 'Medium'},
          {id: 'high', name: 'High'}, {id: 'xhigh', name: 'Extra high'},
        ],
      }},
    ]},
    {id: 'xiaomi-token-plan-cn', models: [{id: 'mimo-v2.6-flash', name: 'Xiaomi MiMo V2.6-Flash'}]},
  ],
};
const entry = currentEntry(snapshot);

test('the picker replaces the supported composer model slot', () => {
  assert.equal(MODEL_SLOT, 'conversation.input.model');
  assert.ok(MODEL_PICKER_PRIORITY < 0);
});

test('only providers with valid models become inline sections', () => {
  assert.deepEqual(sectionsOf(snapshot).map(group => group.id), ['opencode-cpa', 'openai', 'xiaomi-token-plan-cn']);
  assert.deepEqual(sectionsOf(null), []);
  assert.deepEqual(sectionsOf({groups: [null, {}, {id: 'a'}, {id: 'b', models: [null, {}, {id: 1}]}]}), []);
});

test('account and official providers precede the stable remaining provider order', () => {
  const groups = [{id: 'openai'}, {id: 'deepseek-official'}, {id: 'deepseek-account'}, {id: 'opencode-cpa'}];
  const before = structuredClone(groups);
  assert.deepEqual(orderModelProviders(groups).map(group => group.id), ['deepseek-account', 'deepseek-official', 'openai', 'opencode-cpa']);
  assert.deepEqual(groups, before);
});

test('model ordering preserves slash-containing IDs and leaves the catalog intact', () => {
  const group = {id: 'p', models: [{id: 'z'}, null, {id: 42}, {id: '安和桥/a'}, {id: 'a'}]};
  const before = structuredClone(group);
  assert.deepEqual(modelsOf(group).map(model => model.id), ['a', 'z', '安和桥/a']);
  assert.deepEqual(group, before);
  assert.deepEqual(modelsOf(null), []);
});

test('row identity is the exact provider/model tuple, including embedded slashes', () => {
  const first = modelRowId({id: 'provider/a'}, {id: 'b'});
  const second = modelRowId({id: 'provider'}, {id: 'a/b'});
  assert.notEqual(first, second);
  assert.deepEqual(JSON.parse(first), ['provider/a', 'b']);
  assert.deepEqual(JSON.parse(modelRowId({id: 'opencode-cpa'}, {id: '安和桥/grok-4.7'})), ['opencode-cpa', '安和桥/grok-4.7']);
});

test('current entry matches IDs rather than names or partial paths', () => {
  const groups = [
    {id: 'provider/a', models: [{id: 'b', name: 'Shared name'}]},
    {id: 'provider', models: [{id: 'a/b', name: 'Shared name'}]},
  ];
  assert.equal(currentEntry({groups, current: {provider: 'provider', model: 'a/b'}}).group.id, 'provider');
  assert.equal(currentEntry({groups, current: {provider: 'provider', model: 'b'}}), null);
  assert.equal(currentEntry({...snapshot, current: null}), null);
  assert.equal(currentEntry({...snapshot, current: {provider: 'openai', model: 'missing'}}), null);
});

test('checked identity ignores effort but requires the provider/model tuple', () => {
  assert.equal(isCurrentModel(snapshot.current, {provider: 'openai', model: 'gpt-6-astra'}), true);
  assert.equal(isCurrentModel(snapshot.current, {provider: 'openai', model: 'gpt-6-astra', reasoningEffort: 'low'}), true);
  assert.equal(isCurrentModel(snapshot.current, {provider: 'other', model: 'gpt-6-astra'}), false);
  assert.equal(isCurrentModel(snapshot.current, {provider: 'openai', model: 'other'}), false);
  assert.equal(isCurrentModel(null, snapshot.current), false);
});

test('effective effort prefers the explicit value then this model advertised default', () => {
  assert.equal(effectiveEffort(entry, snapshot.current), 'high');
  assert.equal(effectiveEffort(entry, {provider: 'openai', model: 'gpt-6-astra'}), 'medium');
  assert.equal(effectiveEffort(null, null), undefined);
  assert.equal(effectiveEffort(null, {reasoningEffort: 'custom'}), 'custom');
});

test('discrete effort positions use this model advertised metadata order', () => {
  const rows = effortRows(entry, snapshot.current, 'Default');
  assert.deepEqual(rows.map(row => row.effort), ['low', 'medium', 'high', 'xhigh']);
  assert.deepEqual(rows.map(row => row.label), ['Low', 'Medium', 'High', 'Extra high']);
  assert.deepEqual(rows.filter(row => row.active).map(row => row.effort), ['high']);
});

test('a provider that advertises its levels strongest-first still runs the slider fastest-first', () => {
  const reversed = {model: {id: 'm', reasoning: {defaultEffort: 'max', efforts: [
    {id: 'max', name: 'Max'}, {id: 'xhigh', name: 'Extra high'}, {id: 'high', name: 'High'},
    {id: 'medium', name: 'Medium'}, {id: 'low', name: 'Low'},
  ]}}};
  const rows = effortRows(reversed, {reasoningEffort: 'max'}, 'Default');
  assert.deepEqual(rows.map(row => row.effort), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(rows.filter(row => row.active).map(row => row.effort), ['max']);
  assert.equal(rows.at(-1).label, 'Max');
  assert.equal(rows[0].label, 'Low');
});

test('a scale carrying any custom id keeps exactly the order the Host advertised', () => {
  const custom = {model: {reasoning: {defaultEffort: 'deep', efforts: [{id: 'deep'}, {id: 'fast'}, {id: 'max'}]}}};
  assert.deepEqual(effortRows(custom, {}, 'Default').map(row => row.effort), ['deep', 'fast', 'max']);
  const reversedCustom = {model: {reasoning: {defaultEffort: 'max', efforts: [{id: 'max'}, {id: 'deep'}, {id: 'low'}]}}};
  assert.deepEqual(effortRows(reversedCustom, {}, 'Default').map(row => row.effort), ['max', 'deep', 'low']);
});

test('effort positions omit duplicates and invalid IDs without inventing levels', () => {
  const custom = {model: {reasoning: {defaultEffort: 'fast', efforts: [{id: 'deep'}, {id: 'fast'}, {id: 'deep'}, null, {id: 2}]}}};
  const rows = effortRows(custom, {}, 'Default');
  assert.deepEqual(rows.map(row => row.effort), ['deep', 'fast']);
  assert.equal(rows[1].active, true);
  assert.deepEqual(effortSelection({provider: 'p', model: 'm'}, rows, 0), {provider: 'p', model: 'm', reasoningEffort: 'deep'});
});

test('provider default is a position only when no explicit default is advertised', () => {
  const custom = {model: {reasoning: {efforts: [{id: 'low', name: 'Low'}]}}};
  const rows = effortRows(custom, {}, 'Provider default');
  assert.deepEqual(rows.map(row => row.effort), [undefined, 'low']);
  assert.equal(rows[0].label, 'Provider default');
  assert.equal(rows[0].active, true);
  assert.deepEqual(effortSelection({provider: 'p', model: 'a/b'}, rows, 0), {provider: 'p', model: 'a/b'});
  assert.equal(Object.hasOwn(effortSelection({provider: 'p', model: 'a/b'}, rows, 0), 'reasoningEffort'), false);
});

test('a scalar advertised effort remains one position for the disabled slider', () => {
  const rows = effortRows({model: {reasoning: {defaultEffort: 'only', efforts: [{id: 'only', name: 'Only'}]}}}, {}, 'Default');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].active, true);
  assert.equal(rows[0].effort, 'only');
});

test('models without reasoning metadata expose no effort positions', () => {
  assert.deepEqual(effortRows({model: {id: 'plain'}}, {reasoningEffort: 'high'}, 'Default'), []);
  assert.deepEqual(effortRows(null, snapshot.current, 'Default'), []);
});

test('unknown current effort never silently activates high or a nearest position', () => {
  const current = {...snapshot.current, reasoningEffort: 'provider-custom'};
  const rows = effortRows(entry, current, 'Default');
  assert.equal(rows.some(row => row.active), false);
  assert.equal(triggerEffortLabel({...snapshot, current}, entry, rows), 'provider-custom');
});

test('a missing current model retains its caption without fabricating a slider', () => {
  const unknown = {...snapshot, current: {provider: 'missing', model: 'missing'}, retainedEffort: 'Provider value'};
  assert.equal(currentEntry(unknown), null);
  assert.deepEqual(effortRows(currentEntry(unknown), unknown.current, 'Default'), []);
  assert.equal(triggerEffortLabel(unknown, null, []), 'Provider value');
  assert.equal(triggerEffortLabel({}, null, []), '');
  assert.equal(triggerEffortLabel(snapshot, entry, effortRows(entry, snapshot.current, 'Default')), 'High');
});

test('effort selections accept only discrete in-range integer positions', () => {
  const rows = effortRows(entry, snapshot.current, 'Default');
  for (const index of [-1, 0.5, NaN, Infinity, rows.length, '1', null]) {
    assert.equal(effortSelection(snapshot.current, rows, index), null);
  }
  assert.equal(effortSelection(null, rows, 0), null);
  assert.equal(effortSelection(snapshot.current, [], 0), null);
  for (let index = 0; index < rows.length; index++) {
    assert.deepEqual(effortSelection(snapshot.current, rows, index), {
      provider: 'openai', model: 'gpt-6-astra', reasoningEffort: rows[index].effort,
    });
  }
});

test('focus order lists all inline model tuples and excludes headings and slider', () => {
  assert.deepEqual(focusOrder(snapshot).map(value => JSON.parse(value)), [
    ['opencode-cpa', '安和桥/deepseek-v4.1-flash-free'],
    ['opencode-cpa', '安和桥/grok-4.7'],
    ['openai', 'gpt-6-astra'],
    ['xiaomi-token-plan-cn', 'mimo-v2.6-flash'],
  ]);
  assert.deepEqual(focusOrder({...snapshot, pending: {provider: 'openai', model: 'gpt-6-astra'}}), []);
  assert.deepEqual(focusOrder(null), []);
});

test('pending submission and catalog loading are separate states', () => {
  assert.equal(busyState({pending: {}}), true);
  assert.equal(busyState({pending: null}), false);
  assert.equal(busyState({}), false);
  assert.equal(loadingState({status: 'loading'}), true);
  assert.equal(loadingState({status: 'idle'}), true);
  assert.equal(loadingState({status: 'ready'}), false);
});

test('catalog and provider failures coexist with usable provider sections', () => {
  const failed = {...snapshot, error: 'offline', failures: [
    {id: 'provider/a', name: 'Provider A', message: 'credentials expired'},
    {id: 'provider-b', message: 'timeout'},
  ]};
  assert.deepEqual(failureRows(failed), [
    {id: 'load', key: 'picker.loadFailed', params: {message: 'offline'}},
    {id: 'provider:provider/a', key: 'picker.groupFailed', params: {name: 'Provider A', message: 'credentials expired'}},
    {id: 'provider:provider-b', key: 'picker.groupFailed', params: {name: 'provider-b', message: 'timeout'}},
  ]);
  assert.deepEqual(sectionsOf(failed), sectionsOf(snapshot));
  assert.deepEqual(focusOrder(failed), focusOrder(snapshot));
});

test('unspecified catalog and nameless provider errors preserve fallbacks', () => {
  assert.deepEqual(failureRows({status: 'error'}), [{id: 'load', key: 'picker.failed'}]);
  assert.deepEqual(failureRows({failures: [{id: 'p'}]}), [{id: 'provider:p', key: 'picker.groupFailed', params: {name: 'p', message: ''}}]);
  assert.deepEqual(failureRows(snapshot), []);
  assert.deepEqual(failureRows(null), []);
});

test('the menu fits above its trigger and flips below when necessary', () => {
  assert.deepEqual(menuGeometry({top: 600, bottom: 630, right: 800}, {width: 300, height: 200}, {width: 1280, height: 720}), {left: 500, top: 394});
  assert.deepEqual(menuGeometry({top: 100, bottom: 130, right: 800}, {width: 300, height: 200}, {width: 1280, height: 720}), {left: 500, top: 136});
});

test('geometry clamps menu edges on a narrow or overflowing viewport', () => {
  assert.deepEqual(menuGeometry({top: 10, bottom: 40, right: 100}, {width: 304, height: 200}, {width: 320, height: 640}), {left: 8, top: 46});
  assert.deepEqual(menuGeometry({top: 200, bottom: 230, right: 5000}, {width: 300, height: 200}, {width: 1280, height: 720}), {left: 972, top: 236});
});

test('both real dictionaries contain all picker translations used by the fixture', () => {
  const keys = ['fallback', 'loading', 'empty', 'failed', 'sessionInUse', 'effort', 'providerDefault', 'effortUnavailable', 'aria', 'ariaCurrent', 'models', 'account', 'loadFailed', 'groupFailed', 'retry', 'saving'];
  for (const language of ['zh', 'en']) for (const key of keys) {
    assert.equal(typeof dictionaries[language]['picker.' + key], 'string', language + ': picker.' + key);
    assert.ok(dictionaries[language]['picker.' + key].length > 0);
  }
});

test('registration keeps the supported session slot and supplies current locale', () => {
  const source = readFileSync(new URL('../assist/client/index.js', import.meta.url), 'utf8');
  assert.match(source, /ctx\.inject\(\['slots','sessions','modelDirectories'\]/);
  assert.match(source, /scope\.slots\.inject\(MODEL_SLOT/);
  assert.match(source, /priority:MODEL_PICKER_PRIORITY/);
  assert.match(source, /getLocale\s*:/);
  assert.doesNotMatch(source, /MutationObserver|querySelector\('\[data-slot|data-lpa-model-host/);
  assert.doesNotMatch(source, /conversation\.input\.right.*ModelPicker/);
});
