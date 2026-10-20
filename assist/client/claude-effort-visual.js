/*
 * Adapted from Nwflower/dsh-claude-style, source release 0.16.3,
 * commit 33fc20b63d4cbd31cfec98d7952e3c53ec11c832 (control.ts, matrix.ts).
 * See third-party/claude-style/SLIDER-PROVENANCE.json for sources and hashes.
 *
 * MIT License
 * Copyright (c) 2026 Nwflower
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import React from 'react';
import {claudeEffortCss} from './claude-effort-style.js';

export {claudeEffortCss} from './claude-effort-style.js';

const h = React.createElement;
const useLayout = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;
const FLASH_SECONDS = 1.45;

/** Upstream DETENT = .8, in normalized knob travel (centres at 8 and width - 8). */
export function magneticRatio(rawRatio, levelCount) {
  const ratio = Number.isFinite(rawRatio) ? Math.max(0, Math.min(1, rawRatio)) : 0;
  if (levelCount < 2) return ratio;
  const segments = levelCount - 1;
  const segment = Math.floor(ratio * segments);
  if (segment >= segments) return ratio;
  const t = ratio * segments - segment;
  return (segment + t - 0.8 * Math.sin(2 * Math.PI * t) / (2 * Math.PI)) / segments;
}

/** Original five-row solver; width is in CSS px, all packing is in device px. */
export function matrixGeometry(width, devicePixelRatio) {
  if (!Number.isFinite(width) || width <= 0) return null;
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const wDev = Math.round(width * dpr);
  const rows = 5;
  const gap = Math.max(1, Math.round(1 * dpr));
  const margin = Math.max(1, Math.round(0.5 * dpr));
  const hDev = Math.round(26 * dpr);
  const block = Math.max(3, Math.floor((hDev - 2 * margin - (rows - 1) * gap) / rows));
  const cols = Math.max(1, Math.floor((wDev + gap) / (block + gap)));
  const restX = wDev - (cols * block + (cols - 1) * gap);
  const restY = hDev - (rows * block + (rows - 1) * gap);
  return {
    cols, rows, sq: block / dpr, gap: gap / dpr,
    padTop: Math.floor(restY / 2) / dpr,
    padBottom: (restY - Math.floor(restY / 2)) / dpr,
    padLeft: Math.floor(restX / 2) / dpr,
    padRight: (restX - Math.floor(restX / 2)) / dpr,
  };
}

/** Original integer avalanche, kept deterministic for pixel/GIF comparisons. */
export function cellUnit(r, c, seed) {
  let hash = Math.imul(r + 1, 0x9e3779b1) ^ Math.imul(c + 1, 0x85ebca6b) ^ Math.imul(seed + 1, 0x27d4eb2f);
  hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491);
  hash ^= hash >>> 13;
  return (hash >>> 0) / 4294967296;
}

export function cellFade(fx) {
  if (fx <= 0.05) return 0;
  if (fx >= 0.75) return 1;
  const t = (fx - 0.05) / 0.7;
  return t * t * (3 - 2 * t);
}

/** The original tone buckets, entrance sweep and independent flash cycles. */
export function matrixParticle(row, column, columnCount) {
  const fx = columnCount > 1 ? column / (columnCount - 1) : 1;
  return {
    tone: Math.floor(cellUnit(row, column, 1) * 8) % 8,
    opacity: cellFade(fx).toFixed(3),
    entranceDelay: ((1 - fx) * FLASH_SECONDS * 0.31 + cellUnit(row, column, 4) * FLASH_SECONDS * 0.055).toFixed(3) + 's',
    delay: (cellUnit(row, column, 2) * FLASH_SECONDS * 0.95 + FLASH_SECONDS * 0.21).toFixed(3) + 's',
    duration: (FLASH_SECONDS * (0.92 + cellUnit(row, column, 3) * 0.16)).toFixed(3) + 's',
  };
}

function useTrackBox(track) {
  const [box, setBox] = React.useState({width: 0, dpr: 1});
  useLayout(() => {
    const node = track.current;
    if (!node) return;
    const view = node.ownerDocument.defaultView;
    const measure = () => {
      const width = node.clientWidth;
      const dpr = view?.devicePixelRatio > 0 ? view.devicePixelRatio : 1;
      setBox(previous => previous.width === width && previous.dpr === dpr ? previous : {width, dpr});
    };
    measure();
    const Resize = view?.ResizeObserver ?? globalThis.ResizeObserver;
    const observer = typeof Resize === 'function' ? new Resize(measure) : null;
    observer?.observe(node);
    view?.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      view?.removeEventListener('resize', measure);
    };
  }, [track]);
  return box;
}

/**
 * Presentation only. The caller supplies the native range as the last track child
 * and owns its handlers, preview index, raw pointer ratio and committed selection.
 * `label` is the displayed current/preview level, not the axis caption.
 */
export function ClaudeEffortVisual({rows = [], index = 0, position = null, dragging = false,
  disabled = false, unknown = false, label = '', t, children}) {
  const track = React.useRef(null), knob = React.useRef(null), fill = React.useRef(null), value = React.useRef(null);
  const box = useTrackBox(track);
  const count = rows.length;
  const at = Math.max(0, Math.min(Math.max(0, count - 1), Number.isInteger(index) ? index : 0));
  // A single/empty ladder rests at the right end in the original control.
  const ratio = position === null ? (count < 2 ? 1 : at / (count - 1)) : magneticRatio(position, count);
  const pixels = Math.round(ratio * Math.max(0, box.width - 16));
  const geometry = React.useMemo(() => matrixGeometry(box.width, box.dpr), [box.width, box.dpr]);
  const wantsApex = count > 1 && at === count - 1 && !unknown;
  const [matrixBuilt, setMatrixBuilt] = React.useState(false);
  const layout = wantsApex || matrixBuilt ? geometry : null;
  const apex = wantsApex && layout !== null;
  const signature = Math.round(box.width * box.dpr) + '@' + box.dpr;
  useLayout(() => { if (apex) setMatrixBuilt(true); }, [apex]);

  // First layout and resize place instantly. Changes to index/position keep the
  // original CSS glide; data-dragging removes travel easing during pointer moves.
  useLayout(() => {
    if (!knob.current || !fill.current) return;
    knob.current.style.transition = 'none';
    fill.current.style.transition = 'none';
    void knob.current.offsetWidth;
    knob.current.style.transition = '';
    fill.current.style.transition = '';
  }, [box.width]);

  const [swap, setSwap] = React.useState({text: label, previous: '', serial: 0, left: 0});
  useLayout(() => {
    if (swap.text === label) return;
    const left = value.current?.offsetLeft ?? 0;
    setSwap(previous => ({text: label, previous: previous.text, serial: previous.serial + 1, left}));
  }, [label, swap.text]);
  const cells = React.useMemo(() => {
    if (!layout) return null;
    return Array.from({length: layout.rows * layout.cols}, (_, i) => {
      const row = Math.floor(i / layout.cols), column = i % layout.cols;
      const particle = matrixParticle(row, column, layout.cols);
      return h('div', {key: signature + ':' + i, className: 'lpa-ce-matrix-cell',
        style: {'--lpa-ce-cell-delay': particle.entranceDelay}},
      h('div', {className: 'lpa-ce-matrix-sq', 'data-tone': particle.tone,
        style: {opacity: particle.opacity, '--lpa-ce-particle-delay': particle.delay,
          '--lpa-ce-particle-duration': particle.duration}}));
    });
  }, [layout, signature]);
  const copy = key => typeof t === 'function' ? t(key) : {
    'picker.effort': 'Reasoning effort', 'picker.faster': 'Faster', 'picker.smarter': 'Smarter',
  }[key];
  return h(React.Fragment, null,
    h('style', {'data-lpa-ce-style': ''}, claudeEffortCss),
    h('section', {className: 'lpa-effort lpa-ce', 'aria-label': copy('picker.effort'),
      'data-apex': apex ? '' : undefined, 'data-empty': count === 0 ? '' : undefined,
      'data-dragging': dragging && !disabled ? '' : undefined,
      'data-disabled': disabled ? '' : undefined, 'data-unknown': unknown ? 'true' : undefined},
    h('div', {className: 'lpa-ce-head'},
      h('span', {className: 'lpa-ce-label'}, copy('picker.effort')),
      h('span', {className: 'lpa-ce-live', 'aria-live': 'polite', 'aria-atomic': true},
        h('span', {key: swap.serial, ref: value, className: 'lpa-ce-value'}, swap.text)),
      h('span', {key: swap.serial, className: 'lpa-ce-value-ghost', 'aria-hidden': true,
        style: {left: swap.left + 'px'}}, swap.previous)),
    h('div', {className: 'lpa-ce-ends', 'aria-hidden': true},
      h('span', {className: 'lpa-ce-end'}, copy('picker.faster')),
      h('span', {className: 'lpa-ce-end'}, copy('picker.smarter'))),
    h('div', {ref: track, className: 'lpa-effort-slider lpa-ce-track'},
      h('div', {ref: fill, className: 'lpa-ce-fill', 'aria-hidden': true, style: {width: (count ? pixels + 8 : 0) + 'px'}}),
      h('div', {className: 'lpa-ce-ticks', 'aria-hidden': true}, rows.map((row, i) => h('span', {
        key: row.id, className: 'lpa-ce-tick',
        style: {left: Math.round((count < 2 ? 1 : i / (count - 1)) * Math.max(0, box.width - 16) + 8) + 'px'},
      }))),
      h('div', {className: 'lpa-ce-matrix', 'aria-hidden': true, style: layout ? {
        gap: layout.gap + 'px',
        padding: `${layout.padTop}px ${layout.padRight}px ${layout.padBottom}px ${layout.padLeft}px`,
        gridTemplateColumns: `repeat(${layout.cols}, ${layout.sq}px)`, gridAutoRows: layout.sq + 'px',
      } : undefined}, cells),
      h('div', {ref: knob, className: 'lpa-ce-knob', 'aria-hidden': true, style: {translate: pixels + 'px'}}),
      children)));
}
