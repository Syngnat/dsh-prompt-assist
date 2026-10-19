import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Settings} from '../assist/client/settings.js';
import {dictionaries} from '../assist/client/messages.js';

const require = createRequire(import.meta.url);
const React = require('react');

const translator = lang => key => dictionaries[lang][key] ?? key;

function render(overrides = {}) {
  const props = {
    t: translator('zh'),
    config: {enabled: true, followSession: true, provider: '', model: '', reasoningEffort: '', fast: true, rounds: 1},
    catalog: {providers: [], models: []},
    capabilities: {efforts: [], contextWindow: 128000, fastEligible: false},
    allowed: true, saving: false, onChange: () => {}, save: () => {},
    ...overrides,
  };
  return renderToStaticMarkup(createElement(Settings, props));
}

test('a saved Fast flag on an ineligible route is explained, not shown as a blocking error', () => {
  const html = render();
  assert.match(html, /role="status"/);
  assert.ok(html.includes(dictionaries.zh.fastSkipped));
  assert.ok(!html.includes(dictionaries.zh.fastUnsupported));
  assert.doesNotMatch(html, /class="lpa-error"/);
});

test('an ineligible route still permits saving other session controls', () => {
  let saves = 0;
  const html = render({save: () => { saves += 1; }});
  assert.match(html, /<button[^>]*type="submit"/);
  assert.doesNotMatch(html, /<button[^>]*type="submit"[^>]*disabled=""/);
  // The submit path itself must not be gated by fastEligible.
  assert.ok(saves === 0);
});

test('an unsupported effort remains a blocking error', () => {
  const html = render({
    config: {enabled: true, followSession: false, provider: 'deepseek-account', model: 'deepseek-v4.1-flash', reasoningEffort: 'max', fast: false, rounds: 1},
    capabilities: {efforts: [{id: 'low', name: 'Low'}], contextWindow: 128000, fastEligible: false},
  });
  assert.match(html, /role="alert"/);
  assert.ok(html.includes(dictionaries.zh.effortInvalid));
});

test('an eligible route keeps the Fast checkbox usable', () => {
  const html = render({capabilities: {efforts: [], contextWindow: 128000, fastEligible: true}});
  assert.doesNotMatch(html, /<input[^>]*type="checkbox"[^>]*disabled/);
  assert.ok(!html.includes(dictionaries.zh.fastSkipped));
});
