// Browser regression for the composer model menu.
// Runs only in about:blank with synthetic data: no profile, session, draft or model request.
import {buildSync} from 'esbuild';
import {mkdirSync,writeFileSync} from 'node:fs';
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ModelPicker} from './assist/client/model-picker.js';
import {css} from './assist/client/style.js';
const h = React.createElement;
if (location.href !== 'about:blank') throw Error('Model-picker fixture must only run in about:blank');
const style = document.createElement('style'); style.textContent = css; document.head.append(style);
const t = key => key;
const notes = {'["openai","gpt-5"]': 'strong reasoning and long context'};
const notesSource = {getSnapshot: () => notes, subscribe: () => () => {}};
const snapshot = {
  status: 'ready',
  current: {provider: 'openai', model: 'gpt-5', reasoningEffort: 'high'},
  groups: [
    {id: 'openai', name: 'OpenAI', models: [
      {id: 'gpt-5', name: 'GPT-5', reasoning: {defaultEffort: 'medium', efforts: [{id: 'medium', name: 'Medium'}, {id: 'high', name: 'High'}]}},
      {id: 'gpt-4', name: 'GPT-4'},
    ]},
    {id: 'xai', name: 'xAI', models: [{id: 'grok-4', name: 'Grok 4'}]},
  ],
};
const calls = {loads: 0, selections: []};
const directory = {
  store: {getSnapshot: () => snapshot, subscribe: () => () => {}},
  load: () => { calls.loads += 1; return Promise.resolve(snapshot); },
};
function mount(options = {}) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:400px;top:640px;width:300px;height:40px';
  host.className = 'fixture-host';
  document.body.append(host);
  const root = createRoot(host);
  root.render(h(ModelPicker, {
    locked: Boolean(options.locked),
    available: options.available !== false,
    directory: directory.store,
    load: () => { calls.loads += 1; return Promise.resolve(snapshot); },
    select: value => { calls.selections.push(value); return Promise.resolve(options.fail ? {ok: false, error: {code: 'session/writer-held'}} : {ok: true}); },
    t,
    notesSource,
  }));
  return {host, root};
}
window.pickerFixture = {mount, calls, snapshot};
`;
const bundle = buildSync({stdin: {contents: entry, resolveDir: process.cwd(), sourcefile: 'picker-fixture-entry.js'}, bundle: true, write: false, platform: 'browser', format: 'iife'}).outputFiles[0].text;

async function probe(page, bundle) {
  const results = {cases: [], failures: []};
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  try {
    await page.goto('about:blank');
    await page.addScriptTag({content: bundle});
    await page.setViewportSize({width: 1280, height: 720});

    await page.evaluate(() => { window.pickerFixture.mount({}); });
    await settle();
    const trigger = await page.evaluate(() => {
      const button = document.querySelector('.lpa-model-trigger');
      if (!button) return {missing: true};
      const rect = button.getBoundingClientRect();
      return {label: button.textContent, expanded: button.getAttribute('aria-expanded'), disabled: button.disabled, top: rect.top, right: rect.right};
    });
    results.cases.push({step: 'trigger', ...trigger});
    if (trigger.missing || !trigger.label.includes('GPT-5') || trigger.expanded !== 'false' || trigger.disabled) results.failures.push({trigger});

    await page.click('.lpa-model-trigger');
    await settle();
    const open = await page.evaluate(() => {
      const menu = document.querySelector('.lpa-model-menu');
      if (!menu) return {missing: true};
      const rect = menu.getBoundingClientRect();
      const triggerRect = document.querySelector('.lpa-model-trigger').getBoundingClientRect();
      return {
        role: menu.getAttribute('role'),
        aboveTrigger: rect.bottom <= triggerRect.top + 0.5,
        inViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight + 0.5 && rect.right <= innerWidth + 0.5,
        portaled: document.body.contains(menu) && menu.parentElement === document.body,
        cells: [...menu.querySelectorAll('.lpa-model-cell-label')].map(node => node.textContent),
        cellCount: menu.querySelectorAll('.lpa-model-cell').length,
        optionCount: menu.querySelectorAll('.lpa-model-option').length,
        current: [...menu.querySelectorAll('.lpa-model-name')].map(node => node.textContent),
        descriptions: [...menu.querySelectorAll('.lpa-model-desc')].map(node => node.textContent),
        efforts: [...menu.querySelectorAll('.lpa-model-section-title')].map(node => node.textContent),
        loads: window.pickerFixture.calls.loads,
      };
    });
    results.cases.push({step: 'open', ...open});
    if (open.missing || open.role !== 'menu' || !open.aboveTrigger || !open.inViewport || !open.portaled) results.failures.push({open});
    if (!open.cells?.length || !open.cells.includes('OpenAI') || !open.cells.includes('xAI')) results.failures.push({cells: open.cells, cellCount: open.cellCount, optionCount: open.optionCount});
    if (!open.current?.includes('GPT-5')) results.failures.push({current: open.current});
    if (open.descriptions?.length !== 1 || open.descriptions[0] !== 'strong reasoning and long context') results.failures.push({descriptions: open.descriptions});
    if (open.efforts?.length !== 1) results.failures.push({efforts: open.efforts});
    if (open.loads < 1) results.failures.push({loads: open.loads});

    // The provider cell opens the model list beside the first level.
    const submenu = await page.evaluate(() => {
      const cell = [...document.querySelectorAll('.lpa-model-cell')].find(node => node.textContent.includes('xAI'));
      if (!cell) return {missing: 'cell'};
      cell.click();
      return {clicked: true};
    });
    await settle();
    const submenuView = await page.evaluate(() => {
      const panel = document.querySelector('.lpa-model-submenu');
      if (!panel) return {missing: 'panel'};
      const rect = panel.getBoundingClientRect();
      const list = document.querySelector('.lpa-model-menu');
      const listRect = list.getBoundingClientRect();
      return {
        names: [...panel.querySelectorAll('.lpa-model-name')].map(node => node.textContent),
        beside: rect.left >= listRect.right - 1 || rect.right <= listRect.left + 1,
        inViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight + 0.5 && rect.right <= innerWidth + 0.5,
      };
    });
    results.cases.push({step: 'submenu', ...submenu, ...submenuView});
    if (submenu.missing || submenuView.missing || !submenuView.names?.includes('Grok 4') || !submenuView.beside || !submenuView.inViewport) results.failures.push({submenu, submenuView});

    const picked = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.lpa-model-submenu .lpa-model-option')].find(node => node.textContent.includes('Grok 4'));
      if (!row) return {missing: 'row'};
      row.click();
      return {clicked: true};
    });
    await settle();
    const pickResult = await page.evaluate(() => ({
      selections: window.pickerFixture.calls.selections,
      menu: Boolean(document.querySelector('.lpa-model-menu')),
    }));
    results.cases.push({step: 'pick', ...picked, ...pickResult});
    if (pickResult.menu || pickResult.selections.length !== 1 || pickResult.selections[0].model !== 'grok-4' || pickResult.selections[0].provider !== 'xai') results.failures.push({picked, pickResult});

    await page.click('.lpa-model-trigger');
    await settle();
    await page.keyboard.press('Escape');
    await settle();
    const closed = await page.evaluate(() => !document.querySelector('.lpa-model-menu'));
    results.cases.push({step: 'escape', closed});
    if (!closed) results.failures.push({escape: 'menu stayed open'});

    await page.evaluate(() => { document.body.innerHTML = ''; window.pickerFixture.mount({locked: true}); });
    await settle();
    const locked = await page.evaluate(() => document.querySelector('.lpa-model-trigger').disabled);
    results.cases.push({step: 'locked', locked});
    if (!locked) results.failures.push({locked: 'trigger stayed enabled'});

    await page.evaluate(() => { document.body.innerHTML = ''; window.pickerFixture.mount({available: false}); });
    await settle();
    const unavailable = await page.evaluate(() => document.querySelectorAll('.lpa-model-trigger').length);
    results.cases.push({step: 'unavailable', unavailable});
    if (unavailable !== 0) results.failures.push({unavailable: 'rendered a control for an unavailable session'});

    // A rejected selection keeps the menu open and explains the failure.
    await page.evaluate(() => { document.body.innerHTML = ''; window.pickerFixture.mount({fail: true}); });
    await settle();
    await page.click('.lpa-model-trigger');
    await settle();
    await page.evaluate(() => [...document.querySelectorAll('.lpa-model-option')].find(node => node.textContent.includes('GPT-5')).click());
    await settle();
    const failure = await page.evaluate(() => ({
      menu: Boolean(document.querySelector('.lpa-model-menu')),
      alert: document.querySelector('.lpa-model-status--error')?.textContent ?? '',
    }));
    results.cases.push({step: 'failure', ...failure});
    if (!failure.menu || !failure.alert) results.failures.push({failure});

    return {fixtureOnly: true, modelCalls: 0, passed: results.failures.length === 0, cases: results.cases.length, failures: results.failures};
  } finally {
    await page.goto('about:blank');
  }
}

mkdirSync('output/playwright', {recursive: true});
writeFileSync('output/playwright/model-picker-regression.cjs', 'async page => (' + probe.toString() + ')(page,' + JSON.stringify(bundle) + ')');
console.log('Generated output/playwright/model-picker-regression.cjs (about:blank fixture only).');
