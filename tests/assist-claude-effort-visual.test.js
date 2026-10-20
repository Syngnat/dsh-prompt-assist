import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ClaudeEffortVisual, claudeEffortCss, magneticRatio, matrixGeometry, cellUnit, cellFade, matrixParticle} from '../assist/client/claude-effort-visual.js';
import {claudeEffortCss as ownedCss} from '../assist/client/claude-effort-style.js';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const reference = path => read('third-party/claude-style/slider-reference/' + path);
const effortPath = 'packages/client/src/features/effort/';
const originalControl = reference(effortPath + 'control.ts');
const originalMatrix = reference(effortPath + 'matrix.ts');
const originalCss = reference(effortPath + 'effort-picker.css');
const originalMotion = reference('packages/client/src/shared/motion.css');
const tokens = JSON.parse(reference('packages/client/src/theme/tokens.json'));
const hash = (algorithm, text) => createHash(algorithm).update(text).digest('hex');
const compact = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();

// Execute the tiny ORIGINAL functions as independent oracles. The retained raw
// files are hash-pinned below; none of the upstream imports or host code runs.
function originalFunction(source, name, bindings = {}) {
  const found = source.match(new RegExp('^  function ' + name + '\\(([^)]*)\\) \\{([\\s\\S]*?)^  \\}', 'm'));
  assert.ok(found, 'pinned source function ' + name);
  const args = found[1].replace(/:\s*number/g, '');
  return Function(...Object.keys(bindings), 'return function(' + args + ') {' + found[2] + '};')(...Object.values(bindings));
}

test('reference bytes and MIT notice agree with the immutable source provenance', () => {
  const provenance = JSON.parse(read('third-party/claude-style/SLIDER-PROVENANCE.json'));
  assert.equal(provenance.commit, '33fc20b63d4cbd31cfec98d7952e3c53ec11c832');
  assert.equal(provenance.version, '0.16.3');
  assert.equal(provenance.license, 'MIT');
  assert.equal(provenance.copyright, 'Copyright (c) 2026 Nwflower');
  assert.equal(provenance.sources.length, 6);
  for (const item of provenance.sources) {
    const text = read(item.vendoredPath);
    assert.equal(hash('sha256', text), item.sha256, item.sourcePath + ' SHA-256');
    assert.equal(Buffer.byteLength(text), item.bytes, item.sourcePath + ' bytes');
    assert.equal(hash('sha1', 'blob ' + Buffer.byteLength(text) + '\0' + text), item.gitBlobSha1, item.sourcePath + ' Git blob');
    assert.equal(item.sourceUrl, 'https://raw.githubusercontent.com/Nwflower/dsh-claude-style/' + provenance.commit + '/' + item.sourcePath);
  }
  for (const item of provenance.adaptedFiles) assert.equal(hash('sha256', read(item.path)), item.sha256, item.path);
  const license = reference('LICENSE');
  const notice = license.split('\n---')[0].trim().replace(/\s+/g, ' ');
  for (const path of ['assist/client/claude-effort-visual.js', 'assist/client/claude-effort-style.js']) {
    const header = read(path).match(/^\/\*([\s\S]*?)\*\//)[1].replace(/^\s*\* ?/gm, '').replace(/\s+/g, ' ');
    assert.ok(header.includes(notice), path + ' retains complete MIT permission notice');
  }
  assert.equal(hash('sha256', read('third-party/claude-style/LICENSE')), hash('sha256', license));
});

test('magnetic travel matches the original .8 sinusoid across actual track widths and ladders', () => {
  for (const count of [1, 2, 3, 4, 5, 7, 11]) {
    for (const span of [1, 17, 231, 283, 310]) {
      const original = originalFunction(originalControl, 'dampTravel', {
        steps: Array.from({length: count}), geometry: () => ({span}), DETENT: 0.8,
      });
      for (let i = 0; i <= 2000; i++) {
        const ratio = i / 2000;
        const expected = original(ratio * span);
        const actual = magneticRatio(ratio, count) * span;
        assert.ok(Math.abs(actual - expected) < 1e-10, `${count} stops, ${span}px span, ratio ${ratio}`);
        // Both paint paths round to whole CSS px before writing translate/fill.
        if (Math.abs(expected % 1 - 0.5) > 1e-10) assert.equal(Math.round(actual), Math.round(expected));
      }
    }
  }
});

test('magnetic stops and midpoints stay fixed, with monotone detents rather than a spring', () => {
  for (const count of [2, 3, 4, 5, 9]) {
    const segments = count - 1;
    for (let i = 0; i <= segments * 2; i++) {
      const stopOrMidpoint = i / (segments * 2);
      assert.ok(Math.abs(magneticRatio(stopOrMidpoint, count) - stopOrMidpoint) < 1e-14);
    }
    let previous = 0;
    for (let i = 0; i <= 10000; i++) {
      const current = magneticRatio(i / 10000, count);
      assert.ok(current >= previous);
      previous = current;
    }
  }
  const epsilon = 1e-7;
  assert.ok(Math.abs(magneticRatio(epsilon, 2) / epsilon - 0.2) < 1e-8);
  assert.ok(Math.abs((magneticRatio(0.5 + epsilon, 2) - magneticRatio(0.5, 2)) / epsilon - 1.8) < 1e-8);
  assert.equal(magneticRatio(0.37, 1), 0.37);
  assert.equal(magneticRatio(-1, 3), 0);
  assert.equal(magneticRatio(2, 3), 1);
  assert.equal(magneticRatio(NaN, 3), 0);
});

test('matrix geometry is the original five-row integer device-pixel packing at fractional DPRs', () => {
  const original = originalFunction(originalMatrix, 'solveMatrix');
  for (const dpr of [1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]) {
    for (const width of [16, 31, 230, 248, 299, 314, 1024]) {
      const layout = matrixGeometry(width, dpr);
      assert.deepEqual(layout, original(Math.round(width * dpr), dpr));
      assert.equal(layout.rows, 5);
      for (const property of ['sq', 'gap', 'padTop', 'padBottom', 'padLeft', 'padRight']) {
        assert.ok(Math.abs(layout[property] * dpr - Math.round(layout[property] * dpr)) < 1e-10);
      }
      assert.ok(Math.abs((layout.cols * layout.sq + (layout.cols - 1) * layout.gap + layout.padLeft + layout.padRight) * dpr - Math.round(width * dpr)) < 1e-10);
      assert.ok(Math.abs((5 * layout.sq + 4 * layout.gap + layout.padTop + layout.padBottom) * dpr - Math.round(26 * dpr)) < 1e-10);
    }
  }
  assert.deepEqual(matrixGeometry(248, 1), {cols: 49, rows: 5, sq: 4, gap: 1, padTop: 1, padBottom: 1, padLeft: 2, padRight: 2});
  assert.equal(matrixGeometry(0, 2), null);
  assert.equal(matrixGeometry(NaN, 2), null);
  assert.deepEqual(matrixGeometry(248, 0), matrixGeometry(248, 1));
});

test('every particle retains the original deterministic tone, plume opacity and flash/entrance timing', () => {
  const originalUnit = originalFunction(originalMatrix, 'cellUnit');
  const originalFade = originalFunction(originalMatrix, 'cellFade');
  const flash = Number(tokens.motion.find(item => item.token === '--dsh-claude-period-flash').value.replace('ms', '')) / 1000;
  assert.equal(flash, 1.45);
  const tones = new Set(), phases = new Set(), durations = new Set();
  for (const columns of [1, 49, 63]) for (let row = 0; row < 5; row++) for (let column = 0; column < columns; column++) {
    for (let seed = 1; seed <= 4; seed++) assert.equal(cellUnit(row, column, seed), originalUnit(row, column, seed));
    const fx = columns > 1 ? column / (columns - 1) : 1;
    assert.equal(cellFade(fx), originalFade(fx));
    const particle = matrixParticle(row, column, columns);
    assert.deepEqual(particle, {
      tone: Math.floor(originalUnit(row, column, 1) * 8) % 8,
      opacity: originalFade(fx).toFixed(3),
      entranceDelay: ((1 - fx) * flash * 0.31 + originalUnit(row, column, 4) * flash * 0.055).toFixed(3) + 's',
      delay: (originalUnit(row, column, 2) * flash * 0.95 + flash * 0.21).toFixed(3) + 's',
      duration: (flash * (0.92 + originalUnit(row, column, 3) * 0.16)).toFixed(3) + 's',
    });
    assert.deepEqual(matrixParticle(row, column, columns), particle);
    tones.add(particle.tone); phases.add(particle.delay); durations.add(particle.duration);
  }
  assert.equal(tones.size, 8);
  assert.ok(phases.size > 100);
  assert.ok(durations.size > 100);
  assert.equal(cellFade(0.05), 0);
  assert.equal(cellFade(0.75), 1);
});

function rename(text) {
  return text.replaceAll('body[data-dsh-claude-style][data-ds-dark-theme] ', '[data-ds-dark-theme] ')
    .replaceAll('body[data-dsh-claude-style] ', '')
    .replaceAll('.dsh-claude-effort-', '.lpa-ce-').replaceAll('.dsh-claude-effort', '.lpa-effort.lpa-ce')
    .replaceAll('--dsh-claude-', '--lpa-ce-').replaceAll('--dsh-flash-light', '--lpa-ce-flash-light')
    .replaceAll('dshClaudeEffortFlash', 'lpa-ce-flash').replaceAll('dsh-claude-swap-', 'lpa-ce-swap-')
    .replaceAll('dsh-claude-fade-in', 'lpa-ce-fade-in')
    .replace(/(^|\n)(\[data-ds-dark-theme\] )?(\.lpa-ce-[\w-]+)/g, '$1$2.lpa-ce $3')
    .replace('.lpa-ce-track:focus-visible', '.lpa-ce-track:has(> .lpa-ce-input:focus-visible)');
}

test('every original visual declaration and animation frame survives the private selector/token mapping', () => {
  assert.equal(claudeEffortCss, ownedCss);
  const visualCss = originalCss.slice(originalCss.indexOf('body[data-dsh-claude-style] .dsh-claude-effort {'), originalCss.indexOf('/* ---------- reasoning-effort trigger'));
  assert.ok(compact(claudeEffortCss).includes(compact(rename(visualCss))), 'complete original slider rules, with focus handed to the input wrapper');
  for (const name of ['fade-in', 'swap-in', 'swap-out']) {
    const keyframes = originalMotion.match(new RegExp('@keyframes dsh-claude-' + name + ' \\{[\\s\\S]*?\\n\\}'))[0];
    assert.ok(compact(claudeEffortCss).includes(compact(rename(keyframes))), name);
  }
  for (const name of ['duration-feedback', 'duration-surface', 'duration-swap', 'duration-move', 'duration-fade', 'period-flash', 'ease-standard', 'ease-in-out', 'ease-glide', 'distance-nudge', 'blur-soft']) {
    const token = tokens.motion.find(item => item.token === '--dsh-claude-' + name);
    assert.ok(claudeEffortCss.includes('--lpa-ce-' + name + ': ' + token.value + ';'), name);
  }
  for (const item of tokens.apex) {
    const token = item.token.replace('--dsh-claude-', '--lpa-ce-');
    assert.ok(claudeEffortCss.includes(token + ': ' + item.light + ';'));
    assert.ok(claudeEffortCss.includes(token + ': ' + item.dark + ';'));
  }
  assert.doesNotMatch(claudeEffortCss, /data-dsh-claude|--dsh-|\bbody\b|@font-face|url\(/);
});

const rows = Object.freeze(['Low', 'Medium', 'High'].map((label, index) => Object.freeze({id: label, effort: label.toLowerCase(), label, active: index === 0})));
const copy = key => ({'picker.effort': 'Reasoning effort', 'picker.faster': 'Faster', 'picker.smarter': 'Smarter'})[key];
const markup = (props = {}) => renderToStaticMarkup(React.createElement(ClaudeEffortVisual, {
  rows, index: 1, position: null, dragging: false, disabled: false, unknown: false, label: 'Medium', t: copy, ...props,
}, React.createElement('input', {className: 'lpa-ce-input', type: 'range', min: 0, max: rows.length - 1,
  step: 1, defaultValue: 1, 'aria-label': 'Reasoning effort', 'aria-valuetext': 'Medium'})));

test('React contract owns CSS and paint order, with the caller native input LAST inside its own track', () => {
  const html = markup();
  assert.ok(html.startsWith('<style data-lpa-ce-style="">'));
  assert.match(html, /<section class="lpa-effort lpa-ce"/);
  assert.match(html, /class="lpa-effort-slider lpa-ce-track"/);
  const track = html.slice(html.indexOf('<div class="lpa-effort-slider lpa-ce-track"'));
  const names = ['lpa-ce-fill', 'lpa-ce-ticks', 'lpa-ce-matrix', 'lpa-ce-knob', 'lpa-ce-input'];
  for (let i = 1; i < names.length; i++) assert.ok(track.indexOf(names[i]) > track.indexOf(names[i - 1]));
  assert.match(track, /<input class="lpa-ce-input" type="range"[^>]*\/><\/div><\/section>$/);
  assert.ok(html.indexOf('class="lpa-ce-ends"') < html.indexOf('class="lpa-effort-slider lpa-ce-track"'));
  assert.match(html, />Faster<\/span><span class="lpa-ce-end">Smarter<\/span>/);
  assert.match(html, /class="lpa-ce-live" aria-live="polite" aria-atomic="true"><span class="lpa-ce-value">Medium<\/span>/);
  assert.match(html, /class="lpa-ce-value-ghost" aria-hidden="true"/);
  for (const name of ['fill', 'ticks', 'matrix', 'knob']) assert.match(html, new RegExp('class="lpa-ce-' + name + '" aria-hidden="true"'));
  assert.doesNotMatch(html, /role="slider"|tabindex=/);
});

test('empty, unavailable and disabled states retain the visual frame and never manufacture a selected effort', () => {
  for (const props of [{disabled: true}, {unknown: true, label: 'Unavailable'}, {rows: [], label: '—'}, {rows: [rows[0]], index: 0, label: 'Low'}]) {
    const html = markup(props).split('</style>')[1];
    assert.match(html, /class="lpa-effort lpa-ce"/);
    assert.match(html, /class="lpa-effort-slider lpa-ce-track"/);
    assert.match(html, /class="lpa-ce-knob"/);
    assert.doesNotMatch(html, /data-apex/); // No matrix is advertised before track layout exists.
    if (props.disabled) assert.match(html, /data-disabled=""/);
    if (props.unknown) assert.match(html, /data-unknown="true"/);
    if (props.rows?.length === 0) assert.match(html, /data-empty=""/);
  }
  assert.match(markup({disabled: true, dragging: true}), /data-disabled=""/);
  assert.doesNotMatch(markup({disabled: true, dragging: true}).split('</style>')[1], /data-dragging/);
  assert.match(markup({dragging: true}).split('</style>')[1], /data-dragging=""/);
  assert.deepEqual(rows.map(row => row.effort), ['low', 'medium', 'high']);
});

test('transparent range keeps 16px endpoint geometry, wrapper focus, static reduced motion and native forced-colors fallback', () => {
  const css = compact(claudeEffortCss);
  assert.match(css, /\.lpa-ce \.lpa-ce-track > \.lpa-ce-input \{[^}]*position: absolute;[^}]*inset: 0;[^}]*width: 100%;[^}]*height: 30px;[^}]*opacity: 0;/);
  for (const thumb of ['webkit-slider-thumb', 'moz-range-thumb']) {
    assert.ok(css.includes('::-' + thumb));
    assert.match(css, new RegExp('::-' + thumb + ' \\{[^}]*width: 16px;[^}]*height: 30px;'));
  }
  assert.ok(css.includes('.lpa-ce-track:has(> .lpa-ce-input:focus-visible) { outline: 2px solid'));
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'), css.indexOf('@media (forced-colors: active)'));
  for (const name of ['value', 'value-ghost', 'fill', 'ticks', 'knob', 'matrix-cell', 'matrix-sq']) assert.ok(reduced.includes('.lpa-ce-' + name));
  assert.ok(reduced.includes('animation: none !important; transition: none !important;'));
  assert.ok(reduced.includes('.lpa-effort.lpa-ce[data-dragging] .lpa-ce-knob'));
  const forced = css.slice(css.indexOf('@media (forced-colors: active)'));
  assert.match(forced, /\.lpa-effort\.lpa-ce\[data-apex\] \.lpa-ce-matrix/);
  assert.match(forced, /appearance: auto; -webkit-appearance: auto; opacity: 1;/);
  assert.match(forced, /outline-color: Highlight !important/);
});
