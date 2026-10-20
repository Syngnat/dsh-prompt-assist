import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  sectionsOf, currentEntry, effectiveEffort, effortRows, busyState, loadingState,
  levelOneRows, modelsOf, menuGeometry, submenuGeometry, orderModelProviders,
  triggerEffortLabel, MODEL_SLOT, MODEL_PICKER_PRIORITY,
} from '../assist/client/model-picker.js';

const snapshot = {
  status: 'ready',
  current: {provider: 'openai', model: 'gpt-5', reasoningEffort: 'high'},
  groups: [
    {id: 'empty', name: 'Empty', models: []},
    {id: 'openai', name: 'OpenAI', models: [
      {id: 'gpt-5', name: 'GPT-5', reasoning: {defaultEffort: 'medium', efforts: [{id: 'low', name: 'Low'}, {id: 'medium', name: 'Medium'}, {id: 'high', name: 'High'}]}},
      {id: 'gpt-4', name: '', reasoning: {defaultEffort: 'medium', efforts: [{id: 'medium', name: 'Medium'}]}},
      {id: 'bare'},
    ]},
    {id: 'xai', name: 'xAI', models: [{id: 'grok-4', name: 'Grok 4'}]},
  ],
};

test('the picker shadows the shipped seat instead of adding a second control', () => {
  assert.equal(MODEL_SLOT, 'conversation.input.model');
  // The shipped picker registers at the default priority 0; -1 wins in either order.
  assert.ok(MODEL_PICKER_PRIORITY < 0);
});

test('only providers holding models become sections', () => {
  assert.deepEqual(sectionsOf(snapshot).map(group => group.id), ['openai', 'xai']);
  assert.deepEqual(sectionsOf(null), []);
  assert.deepEqual(sectionsOf({groups: [{id: 'a'}]}), []);
});

test('account and official providers come first, like the shipped picker', () => {
  const groups = [
    {id: 'openai', name: 'OpenAI', models: [{id: 'gpt-5'}]},
    {id: 'deepseek-official', name: 'DeepSeek', models: [{id: 'ds'}]},
    {id: 'deepseek-account', name: 'Account', models: [{id: 'acc'}]},
    {id: 'xai', name: 'xAI', models: [{id: 'grok-4'}]},
  ];
  assert.deepEqual(orderModelProviders(groups).map(group => group.id), ['deepseek-account', 'deepseek-official', 'openai', 'xai']);
  assert.deepEqual(sectionsOf({groups}).map(group => group.id), ['deepseek-account', 'deepseek-official', 'openai', 'xai']);
  // The input list is never mutated.
  assert.deepEqual(groups.map(group => group.id), ['openai', 'deepseek-official', 'deepseek-account', 'xai']);
});

test('the current model resolves through the catalog, never by name guessing', () => {
  assert.equal(currentEntry(snapshot).model.id, 'gpt-5');
  assert.equal(currentEntry({...snapshot, current: {provider: 'openai', model: 'missing'}}), null);
  assert.equal(currentEntry({...snapshot, current: null}), null);
});

test('the effective effort is the explicit selection, then the advertised default', () => {
  const entry = currentEntry(snapshot);
  assert.equal(effectiveEffort(entry, snapshot.current), 'high');
  assert.equal(effectiveEffort(entry, {...snapshot.current, reasoningEffort: undefined}), 'medium');
  assert.equal(effectiveEffort(null, snapshot.current), '');
});

test('an effort list appears only when the model exposes a real choice', () => {
  const entry = currentEntry(snapshot);
  const rows = effortRows(entry, snapshot.current, 'Default');
  assert.deepEqual(rows.map(row => row.id), ['effort:low', 'effort:medium', 'effort:high']);
  assert.deepEqual(rows.filter(row => row.active).map(row => row.id), ['effort:high']);
  const single = snapshot.groups[1].models[1];
  assert.deepEqual(effortRows({group: snapshot.groups[1], model: single}, snapshot.current, 'Default'), []);
  assert.deepEqual(effortRows({group: snapshot.groups[1], model: snapshot.groups[1].models[2]}, snapshot.current, 'Default'), []);
});

test('a provider default is offered when the model advertises no default effort', () => {
  const entry = {group: snapshot.groups[1], model: {id: 'm', reasoning: {efforts: [{id: 'a', name: 'A'}]}}};
  const rows = effortRows(entry, {provider: 'openai', model: 'm', reasoningEffort: 'a'}, 'Default');
  assert.deepEqual(rows.map(row => row.id), ['effort:provider-default', 'effort:a']);
  assert.equal(rows[0].effort, undefined);
});

test('a model that left the catalog keeps its effort caption', () => {
  const entry = currentEntry(snapshot);
  const rows = effortRows(entry, snapshot.current, 'Default');
  assert.equal(triggerEffortLabel(snapshot, entry, rows), 'High');
  // No catalog entry: the retained caption is the only truth left.
  assert.equal(triggerEffortLabel({retainedEffort: 'Medium'}, null, []), 'Medium');
  assert.equal(triggerEffortLabel({}, null, []), '');
});

test('level one shows the current model first and then one cell per provider', () => {
  const rows = levelOneRows(snapshot);
  assert.equal(rows[0].kind, 'current');
  assert.equal(rows[0].model.id, 'gpt-5');
  assert.deepEqual(rows.slice(1).map(row => row.group.id), ['openai', 'xai']);
  assert.deepEqual(modelsOf(snapshot.groups[1]).map(model => model.id), ['gpt-5', 'gpt-4', 'bare']);
  assert.deepEqual(modelsOf(null), []);
});

test('busy means a pending submission, loading means the catalog is still arriving', () => {
  assert.equal(busyState({pending: {}}), true);
  assert.equal(busyState({pending: null}), false);
  assert.equal(busyState({}), false);
  assert.equal(loadingState({status: 'loading'}), true);
  assert.equal(loadingState({status: 'idle'}), true);
  assert.equal(loadingState({status: 'ready'}), false);
});

test('the menu opens above the trigger, flips below and stays inside the viewport', () => {
  assert.deepEqual(menuGeometry({top: 600, bottom: 630, right: 800}, {width: 300, height: 200}, {width: 1280, height: 720}), {left: 500, top: 392});
  assert.deepEqual(menuGeometry({top: 100, bottom: 130, right: 800}, {width: 300, height: 200}, {width: 1280, height: 720}), {left: 500, top: 138});
  assert.deepEqual(menuGeometry({top: 10, bottom: 40, right: 100}, {width: 300, height: 200}, {width: 1280, height: 720}), {left: 12, top: 48});
  assert.deepEqual(menuGeometry({top: 200, bottom: 230, right: 5000}, {width: 300, height: 200}, {width: 1280, height: 720}), {left: 968, top: 238});
});

test('the submenu opens beside the list and flips to the other side when needed', () => {
  const anchor = {left: 800, right: 1000, top: 300};
  assert.deepEqual(submenuGeometry(anchor, {width: 240, height: 200}, {width: 1280, height: 720}), {left: 1008, top: 300});
  assert.deepEqual(submenuGeometry({left: 1000, right: 1200, top: 100}, {width: 240, height: 200}, {width: 1280, height: 720}), {left: 752, top: 100});
});

test('the client registration uses the supported slot path, not DOM surgery', () => {
  const source = readFileSync(new URL('../assist/client/index.js', import.meta.url), 'utf8');
  assert.match(source, /ctx\.inject\(\['slots','sessions','modelDirectories'\]/);
  assert.match(source, /scope\.slots\.inject\(MODEL_SLOT/);
  assert.match(source, /scope\.slots\.register\(\{/);
  assert.match(source, /priority:MODEL_PICKER_PRIORITY/);
  // No whole-document observation, no native-control hiding, no second composer button.
  assert.doesNotMatch(source, /MutationObserver|querySelector\('\[data-slot|data-lpa-model-host/);
  assert.doesNotMatch(source, /conversation\.input\.right.*ModelPicker/);
});
