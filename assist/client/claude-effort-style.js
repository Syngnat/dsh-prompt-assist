/*
 * Slider-only adaptation of Nwflower/dsh-claude-style 0.16.3.
 * Source commit: 33fc20b63d4cbd31cfec98d7952e3c53ec11c832.
 * Sources and hashes: third-party/claude-style/SLIDER-PROVENANCE.json.
 *
 * MIT License
 *
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
export const claudeEffortCss = `
.lpa-effort.lpa-ce {
  --lpa-ce-duration-feedback: 120ms;
  --lpa-ce-duration-surface: 150ms;
  --lpa-ce-duration-swap: 150ms;
  --lpa-ce-duration-move: 200ms;
  --lpa-ce-duration-fade: 300ms;
  --lpa-ce-period-flash: 1450ms;
  --lpa-ce-ease-standard: ease;
  --lpa-ce-ease-in-out: ease-in-out;
  --lpa-ce-ease-glide: cubic-bezier(0.22, 0.61, 0.36, 1);
  --lpa-ce-distance-nudge: 4px;
  --lpa-ce-blur-soft: 2px;
  --lpa-ce-apex: #8b7ad0;
  --lpa-ce-apex-flash: #d9d2f5;
  --lpa-ce-apex-ink: #5f51b5;
  --lpa-ce-timing-feedback: var(--lpa-ce-duration-feedback) var(--lpa-ce-ease-standard);
  --lpa-ce-swap-blur: var(--lpa-ce-blur-soft);
  --lpa-ce-swap-ease: var(--lpa-ce-ease-in-out);
  --lpa-ce-swap-distance: var(--lpa-ce-distance-nudge);
  box-sizing: border-box;
  flex: none;
  margin: 0;
  border: 0;
  font-weight: 400;
}
[data-ds-dark-theme] .lpa-effort.lpa-ce {
  --lpa-ce-apex: #9d8ce0;
  --lpa-ce-apex-flash: #e6e0fb;
  --lpa-ce-apex-ink: #b9adf0;
}
.lpa-effort.lpa-ce {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 3px 7px 4px 7px;
  min-width: 0;
  user-select: none;
  -webkit-user-select: none;
}
.lpa-ce .lpa-ce-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;

  position: relative;
}

.lpa-ce .lpa-ce-label {
  flex: none;
  font-size: 13px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary, #6e6a60);
}

.lpa-ce .lpa-ce-value {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 16px;
  color: var(--dsw-alias-label-primary, #141413);
  transition: color var(--lpa-ce-timing-feedback);
  animation: lpa-ce-swap-in var(--lpa-ce-duration-swap) var(--lpa-ce-swap-ease);
}

.lpa-ce .lpa-ce-value,
.lpa-ce .lpa-ce-value-ghost {
  --lpa-ce-swap-distance: var(--lpa-ce-distance-nudge);
}
.lpa-ce .lpa-ce-value-ghost {
  position: absolute;
  left: 0;
  top: 0;
  white-space: nowrap;
  pointer-events: none;
  font-size: 13px;
  line-height: 16px;
  color: var(--dsw-alias-label-primary, #141413);
  opacity: 0;
  animation: lpa-ce-swap-out var(--lpa-ce-duration-swap) var(--lpa-ce-swap-ease) forwards;
}

.lpa-ce .lpa-ce-ends {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  line-height: 14px;
  color: var(--dsw-alias-label-caption, #a6a094);
}
.lpa-ce .lpa-ce-track {
  position: relative;

  height: 30px;
  margin-top: 1px;
  cursor: pointer;
  touch-action: none;
}
.lpa-ce .lpa-ce-track::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;

  height: 26px;
  margin-top: -13px;

  border-radius: 8px;

  corner-shape: round;
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.08));
}

.lpa-ce .lpa-ce-fill {
  position: absolute;
  left: 0;
  top: 50%;
  height: 26px;
  margin-top: -13px;

  border-radius: 8px 0 0 8px;
  corner-shape: round;
  background: color-mix(in srgb, var(--dsw-alias-label-primary, #141413) 26%, transparent);
  transition: width var(--lpa-ce-duration-move) var(--lpa-ce-ease-glide), opacity var(--lpa-ce-duration-move) var(--lpa-ce-ease-standard);
  pointer-events: none;
}

.lpa-ce .lpa-ce-ticks {
  position: absolute;
  inset: 0;
  transition: opacity var(--lpa-ce-duration-move) var(--lpa-ce-ease-standard);
  pointer-events: none;
}
.lpa-ce .lpa-ce-tick {
  position: absolute;
  top: 50%;
  width: 4px;
  height: 4px;
  margin-top: -2px;
  transform: translateX(-50%);
  border-radius: 50%;
  corner-shape: round;
  background: color-mix(in srgb, var(--dsw-alias-label-primary, #141413) 26%, transparent);
}

.lpa-ce .lpa-ce-matrix {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 26px;
  margin-top: -13px;
  border-radius: 8px;
  corner-shape: round;
  overflow: hidden;
  box-sizing: border-box;

  display: none;
  pointer-events: none;
}
.lpa-effort.lpa-ce[data-apex] .lpa-ce-matrix {
  display: grid !important;
  grid-auto-flow: row !important;
}

.lpa-ce .lpa-ce-matrix-cell {
  animation: lpa-ce-fade-in var(--lpa-ce-duration-surface) var(--lpa-ce-ease-standard) both !important;
}
.lpa-ce .lpa-ce-matrix-sq {
  width: 100% !important;
  height: 100% !important;
  border-radius: 1px !important;

  background-color: var(--lpa-ce-apex, #8b7ad0);

  --lpa-ce-flash-light: var(--lpa-ce-apex-flash, #d9d2f5);

  animation: lpa-ce-flash var(--lpa-ce-period-flash) infinite var(--lpa-ce-ease-in-out) !important;
}
.lpa-ce .lpa-ce-matrix-sq[data-tone="0"] {
  --lpa-ce-flash-light: color-mix(in srgb, var(--lpa-ce-apex, #8b7ad0) 62%, var(--lpa-ce-apex-flash, #d9d2f5));
}
.lpa-ce .lpa-ce-matrix-sq[data-tone="1"] {
  --lpa-ce-flash-light: color-mix(in srgb, var(--lpa-ce-apex, #8b7ad0) 54%, var(--lpa-ce-apex-flash, #d9d2f5));
}
.lpa-ce .lpa-ce-matrix-sq[data-tone="2"] {
  --lpa-ce-flash-light: color-mix(in srgb, var(--lpa-ce-apex, #8b7ad0) 46%, var(--lpa-ce-apex-flash, #d9d2f5));
}
.lpa-ce .lpa-ce-matrix-sq[data-tone="3"] {
  --lpa-ce-flash-light: color-mix(in srgb, var(--lpa-ce-apex, #8b7ad0) 38%, var(--lpa-ce-apex-flash, #d9d2f5));
}
.lpa-ce .lpa-ce-matrix-sq[data-tone="4"] {
  --lpa-ce-flash-light: color-mix(in srgb, var(--lpa-ce-apex, #8b7ad0) 30%, var(--lpa-ce-apex-flash, #d9d2f5));
}
.lpa-ce .lpa-ce-matrix-sq[data-tone="5"] {
  --lpa-ce-flash-light: color-mix(in srgb, var(--lpa-ce-apex, #8b7ad0) 22%, var(--lpa-ce-apex-flash, #d9d2f5));
}
.lpa-ce .lpa-ce-matrix-sq[data-tone="6"] {
  --lpa-ce-flash-light: color-mix(in srgb, var(--lpa-ce-apex, #8b7ad0) 14%, var(--lpa-ce-apex-flash, #d9d2f5));
}
.lpa-ce .lpa-ce-matrix-sq[data-tone="7"] {
  --lpa-ce-flash-light: color-mix(in srgb, var(--lpa-ce-apex, #8b7ad0) 6%, var(--lpa-ce-apex-flash, #d9d2f5));
}
@keyframes lpa-ce-flash {
  0%, 17.24% { background-color: var(--lpa-ce-apex, #8b7ad0); }
  17.25%, 50.34% { background-color: var(--lpa-ce-flash-light, #d9d2f5); }
  100% { background-color: var(--lpa-ce-apex, #8b7ad0); }
}

.lpa-effort.lpa-ce[data-apex] .lpa-ce-fill {
  opacity: 0 !important;
}
.lpa-effort.lpa-ce[data-apex] .lpa-ce-ticks {
  opacity: 0 !important;
}
.lpa-effort.lpa-ce[data-apex] .lpa-ce-knob {
  background: color-mix(in srgb, var(--lpa-ce-apex, #8b7ad0) 22%, var(--dsw-static-neutral-bluish-00, #ffffff)) !important;
  box-shadow: 0 0 10px color-mix(in srgb, var(--lpa-ce-apex, #8b7ad0) 80%, transparent), 0 0 0 1px color-mix(in srgb, var(--lpa-ce-apex, #8b7ad0) 35%, transparent) !important;
}
.lpa-effort.lpa-ce[data-apex] .lpa-ce-value {
  color: var(--lpa-ce-apex-ink, #5f51b5) !important;
}

.lpa-ce .lpa-ce-knob {
  position: absolute;
  left: 0;
  top: 50%;
  width: 16px;
  height: 30px;
  margin-top: -15px;

  border-radius: 5px;
  corner-shape: round;

  background: var(--dsw-static-neutral-bluish-00, #ffffff);
  box-shadow: 0 1px 3px rgba(20, 20, 19, 0.28), 0 0 0 1px rgba(20, 20, 19, 0.06);

  scale: 1;
  transition: translate var(--lpa-ce-duration-move) var(--lpa-ce-ease-glide), scale var(--lpa-ce-timing-feedback), background-color var(--lpa-ce-duration-fade) var(--lpa-ce-ease-standard), box-shadow var(--lpa-ce-duration-fade) var(--lpa-ce-ease-standard);
  will-change: translate, scale;
}
[data-ds-dark-theme] .lpa-ce .lpa-ce-knob {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.4);
}
[data-ds-dark-theme] .lpa-effort.lpa-ce[data-apex] .lpa-ce-knob {
  box-shadow: 0 0 10px color-mix(in srgb, var(--lpa-ce-apex, #9d8ce0) 80%, transparent), 0 0 0 1px color-mix(in srgb, var(--lpa-ce-apex, #9d8ce0) 35%, transparent) !important;
}

.lpa-effort.lpa-ce[data-dragging] .lpa-ce-knob {
  scale: 1.1 !important;

  transition: scale var(--lpa-ce-timing-feedback), background-color var(--lpa-ce-duration-fade) var(--lpa-ce-ease-standard), box-shadow var(--lpa-ce-duration-fade) var(--lpa-ce-ease-standard) !important;
}
.lpa-effort.lpa-ce[data-dragging] .lpa-ce-fill {
  transition: none !important;
}
.lpa-ce .lpa-ce-track:has(> .lpa-ce-input:focus-visible) {
  outline: 2px solid var(--dsw-alias-brand-primary, #d97757) !important;
  outline-offset: 1px !important;
  border-radius: 10px !important;
}

.lpa-effort.lpa-ce[data-empty] .lpa-ce-track::before {
  opacity: 0.55 !important;
}
.lpa-effort.lpa-ce[data-empty] .lpa-ce-value {
  color: var(--dsw-alias-label-caption, #a6a094) !important;
}
@keyframes lpa-ce-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes lpa-ce-swap-out {
  from { opacity: 1; filter: blur(0); transform: translateY(0); }
  to { opacity: 0; filter: blur(var(--lpa-ce-swap-blur)); transform: translateY(calc(-1 * var(--lpa-ce-swap-distance))); }
}
@keyframes lpa-ce-swap-in {
  from { opacity: 0; filter: blur(var(--lpa-ce-swap-blur)); transform: translateY(var(--lpa-ce-swap-distance)); }
  to { opacity: 1; filter: blur(0); transform: translateY(0); }
}
/* The live region survives every animated text swap. */
.lpa-ce .lpa-ce-live {
  flex: 0 1 auto;
  min-width: 0;
}
.lpa-ce .lpa-ce-value { display: block; }
.lpa-ce .lpa-ce-label,
.lpa-ce .lpa-ce-value,
.lpa-ce .lpa-ce-value-ghost { font-weight: 400; }
/* Clear the older slider's generic margins without changing upstream metrics. */
.lpa-ce .lpa-ce-track { margin: 1px 0 0; min-height: 30px; padding: 0; border: 0; }
.lpa-ce .lpa-ce-knob { pointer-events: none; }
.lpa-effort.lpa-ce[data-disabled] { opacity: .55; }
.lpa-effort.lpa-ce[data-disabled] .lpa-ce-track { cursor: default; }
/* Variables retain upstream !important delay/duration precedence while allowing
   the reduced-motion media rule to turn the entire animation off. */
.lpa-ce .lpa-ce-matrix-cell { animation-delay: var(--lpa-ce-cell-delay, 0s) !important; }
.lpa-ce .lpa-ce-matrix-sq {
  animation-delay: var(--lpa-ce-particle-delay, 0s) !important;
  animation-duration: var(--lpa-ce-particle-duration, var(--lpa-ce-period-flash)) !important;
}
/* The caller's range owns all interaction, covering only this track. Its 16px
   thumb gives the same centre endpoints (8px, width - 8px) as the visual knob. */
.lpa-ce .lpa-ce-track > .lpa-ce-input {
  appearance: none;
  -webkit-appearance: none;
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 30px;
  min-width: 0;
  max-width: none;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  opacity: 0;
  background: transparent;
  color: transparent;
  box-shadow: none;
  outline: none;
  cursor: pointer;
  touch-action: none;
  direction: ltr;
}
.lpa-ce .lpa-ce-track > .lpa-ce-input:disabled { opacity: 0; cursor: default; }
.lpa-ce .lpa-ce-track > .lpa-ce-input:focus-visible { outline: none; }
.lpa-ce .lpa-ce-track > .lpa-ce-input::-webkit-slider-runnable-track {
  height: 30px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.lpa-ce .lpa-ce-track > .lpa-ce-input::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  width: 16px;
  height: 30px;
  margin: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  box-shadow: none;
}
.lpa-ce .lpa-ce-track > .lpa-ce-input::-moz-range-track,
.lpa-ce .lpa-ce-track > .lpa-ce-input::-moz-range-progress {
  height: 30px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}
.lpa-ce .lpa-ce-track > .lpa-ce-input::-moz-range-thumb {
  box-sizing: border-box;
  width: 16px;
  height: 30px;
  margin: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  box-shadow: none;
}
@media (prefers-reduced-motion: reduce) {
  .lpa-effort.lpa-ce .lpa-ce-value,
  .lpa-effort.lpa-ce .lpa-ce-value-ghost,
  .lpa-effort.lpa-ce .lpa-ce-fill,
  .lpa-effort.lpa-ce .lpa-ce-ticks,
  .lpa-effort.lpa-ce .lpa-ce-knob,
  .lpa-effort.lpa-ce[data-dragging] .lpa-ce-knob,
  .lpa-effort.lpa-ce .lpa-ce-matrix-cell,
  .lpa-effort.lpa-ce .lpa-ce-matrix-sq {
    animation: none !important;
    transition: none !important;
  }
  .lpa-effort.lpa-ce .lpa-ce-value-ghost { visibility: hidden; }
  .lpa-effort.lpa-ce[data-dragging] .lpa-ce-knob { scale: 1 !important; }
}
@media (forced-colors: active) {
  .lpa-ce .lpa-ce-track::before,
  .lpa-ce .lpa-ce-fill,
  .lpa-ce .lpa-ce-ticks,
  .lpa-ce .lpa-ce-matrix,
  .lpa-effort.lpa-ce[data-apex] .lpa-ce-matrix,
  .lpa-ce .lpa-ce-knob { display: none !important; }
  .lpa-ce .lpa-ce-track > .lpa-ce-input,
  .lpa-ce .lpa-ce-track > .lpa-ce-input:disabled {
    appearance: auto;
    -webkit-appearance: auto;
    opacity: 1;
    color: CanvasText;
    forced-color-adjust: auto;
  }
  .lpa-ce .lpa-ce-track > .lpa-ce-input::-webkit-slider-runnable-track {
    all: revert;
  }
  .lpa-ce .lpa-ce-track > .lpa-ce-input::-webkit-slider-thumb {
    all: revert;
    width: 16px;
    height: 30px;
  }
  .lpa-ce .lpa-ce-track > .lpa-ce-input::-moz-range-track,
  .lpa-ce .lpa-ce-track > .lpa-ce-input::-moz-range-progress {
    all: revert;
  }
  .lpa-ce .lpa-ce-track > .lpa-ce-input::-moz-range-thumb {
    all: revert;
    width: 16px;
    height: 30px;
  }
  .lpa-ce .lpa-ce-track:has(> .lpa-ce-input:focus-visible) { outline-color: Highlight !important; }
}
`;
