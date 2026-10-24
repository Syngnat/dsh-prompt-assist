import React from 'react';
import {zcodeEffortCss} from './zcode-effort-style.js';

const h = React.createElement;

/*
 * Presentation port of zai-org/ZCode's composer thought slider (Apache-2.0,
 * see third-party/zcode-style/). Same component contract as ClaudeEffortVisual:
 * the caller owns the gesture state and supplies the native range as the last
 * track child. Deviations from the original are recorded in PROVENANCE.json.
 */

/** Fixed seeds so re-renders never reshuffle the flowing bubbles (ZCode's EFFORT_BUBBLES). */
export const EFFORT_BUBBLES = [
  {top: 4, size: 2, duration: 2.6, delay: -0.4},
  {top: 14, size: 3, duration: 3.2, delay: -2.1},
  {top: 8, size: 4, duration: 2.8, delay: -1.1},
  {top: 18, size: 2, duration: 3.6, delay: -0.8},
  {top: 3, size: 3, duration: 3, delay: -2.5},
  {top: 12, size: 2, duration: 3.4, delay: -1.7},
  {top: 6, size: 3, duration: 3.1, delay: -0.9},
  {top: 17, size: 4, duration: 2.9, delay: -2.3},
  {top: 10, size: 2, duration: 3.5, delay: -0.2},
  {top: 2, size: 2, duration: 2.7, delay: -1.8},
  {top: 15, size: 3, duration: 3.3, delay: -1.2},
  {top: 7, size: 4, duration: 3.6, delay: -3.1},
];

/** GLM FlashX and Highspeed share one look; only the display name decides, never internal ids. */
export function isGlmHighspeedModel(name) {
  return /glm/i.test(name) && /highspeed|flashx/i.test(name);
}

/** Highspeed bubbles are the same seeds repeated and sped up (ZCode's HIGHSPEED_BUBBLES). */
export function highspeedBubbles(count = 32) {
  return Array.from({length: count}, (_, index) => ({
    ...EFFORT_BUBBLES[index % EFFORT_BUBBLES.length],
    duration: (8 + (index % 5)) / 10,
    delay: -index * 0.137,
  }));
}

export function ZcodeEffortVisual({rows = [], index = 0, position = null, dragging = false,
  disabled = false, unknown = false, highspeed = false, label = '', t, children}) {
  const count = rows.length;
  const at = Math.max(0, Math.min(Math.max(0, count - 1), Number.isInteger(index) ? index : 0));
  const ratio = position === null
    ? (count < 2 ? 1 : at / (count - 1))
    : Math.max(0, Math.min(1, position));
  const atMax = count > 1 && at === count - 1 && !unknown && !disabled;
  // The pointer hovers the nearest stop while dragging; ZCode tracks pointermove per stop.
  const hovered = dragging && count > 1 ? Math.round(ratio * (count - 1)) : null;
  const bubbles = highspeed ? highspeedBubbles() : EFFORT_BUBBLES;
  return h(React.Fragment, null,
    h('style', {'data-lpa-zt-style': ''}, zcodeEffortCss),
    h('section', {className: 'lpa-effort lpa-zt', 'aria-label': t('picker.effort'),
      'data-max': atMax ? '' : undefined, 'data-highspeed': highspeed ? '' : undefined,
      'data-dragging': dragging && !disabled ? '' : undefined,
      'data-disabled': disabled ? '' : undefined, 'data-unknown': unknown ? 'true' : undefined},
    h('div', {className: 'lpa-zt-head'},
      h('span', {className: 'lpa-zt-label'}, t('picker.effort')),
      h('span', {className: 'lpa-zt-value', 'aria-live': 'polite', 'aria-atomic': true}, label)),
    h('div', {className: 'lpa-zt-slider'},
      h('div', {className: 'lpa-zt-track', 'aria-hidden': true},
        h('div', {className: 'lpa-zt-fill', 'aria-hidden': true,
          style: {width: 'calc(14px + (100% - 28px) * ' + ratio + ')'}},
        atMax ? h('div', {className: 'lpa-zt-bubbles', 'aria-hidden': true},
          bubbles.map((bubble, i) => h('span', {key: i, className: 'lpa-zt-bubble',
            style: {top: bubble.top + 'px', animationDuration: bubble.duration + 's',
              animationDelay: bubble.delay + 's'}},
            h('span', {style: {width: bubble.size + 'px', height: bubble.size + 'px'}})))) : null)),
      h('div', {className: 'lpa-zt-stops', 'aria-hidden': true}, rows.map((row, i) => h('span', {
        key: row.id, className: 'lpa-zt-stop',
        'data-filled': count > 1 && i <= at ? '' : undefined,
        'data-hovered': i === hovered ? '' : undefined}))),
      h('div', {className: 'lpa-zt-thumb', 'aria-hidden': true,
        style: {left: 'calc((100% - 28px) * ' + ratio + ')'}}),
      children)));
}
