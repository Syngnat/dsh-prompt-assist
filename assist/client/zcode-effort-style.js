/*
 * Thought-effort slider adaptation of zai-org/ZCode.
 * Source commit: 3c5b227649371507ddc4eb46ac5133afe6db1cab
 * (packages/ui/src/chat-input-toolbar/composer-thought-slider.css and the
 * EFFORT_BUBBLES seeds in ComposerModelMenu.tsx).
 * Sources and hashes: third-party/zcode-style/SLIDER-PROVENANCE.json.
 *
 * Apache License 2.0 — the verbatim license text ships in
 * third-party/zcode-style/LICENSE. Colors are ZCode's own literals
 * (Tailwind green-600/500, blue-500, purple-500); text and surface colors
 * keep DSH's --dsw-alias-* tokens so both DSH themes stay readable.
 */
export const zcodeEffortCss = `
.lpa-effort.lpa-zt{
  --lpa-zt-success:#16a34a;
  --lpa-zt-accent:#3b82f6;
  --lpa-zt-accent-alt:#a855f7;
  --lpa-zt-ink:var(--dsw-alias-label-primary,#171717);
  --lpa-zt-muted:var(--dsw-alias-label-secondary,var(--lpa-zt-ink));
  --lpa-zt-track:color-mix(in srgb,var(--lpa-zt-ink) 10%,transparent);
  box-sizing:border-box;flex:none;margin:0;border:0;font-weight:400;
}
[data-ds-dark-theme] .lpa-effort.lpa-zt{--lpa-zt-success:#22c55e}
.lpa-effort.lpa-zt{display:flex;flex-direction:column;gap:6px;padding:8px 8px 10px;min-width:0;user-select:none;-webkit-user-select:none}
.lpa-zt-head{display:flex;align-items:baseline;gap:8px;min-width:0;padding:0 6px}
.lpa-zt-label{flex:none;font-size:13px;line-height:16px;color:var(--lpa-zt-muted)}
.lpa-zt-value{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:16px;color:var(--lpa-zt-ink)}
.lpa-zt-slider{position:relative;height:32px;border-radius:9999px}
.lpa-effort.lpa-zt[data-disabled] .lpa-zt-slider{opacity:.5}
.lpa-effort.lpa-zt[data-disabled] .lpa-zt-input{cursor:default}
.lpa-zt-track{position:absolute;left:0;right:0;top:4px;height:24px;border-radius:9999px;background:var(--lpa-zt-track);overflow:hidden}
.lpa-zt-track::before{content:"";position:absolute;inset:0;border-radius:inherit;border:1px solid var(--lpa-zt-track)}
.lpa-zt-fill{position:absolute;top:0;bottom:0;left:0;border-radius:9999px;background:var(--lpa-zt-success);transition:width 120ms ease-out;overflow:hidden;pointer-events:none}
.lpa-zt-fill::before{content:"";position:absolute;inset:0;border-radius:inherit;opacity:0;transition:opacity 200ms ease-out;background:linear-gradient(270deg in oklch shorter hue,var(--lpa-zt-accent) 0%,var(--lpa-zt-success) 100%)}
.lpa-effort.lpa-zt[data-max] .lpa-zt-fill::before{opacity:1}
.lpa-effort.lpa-zt[data-highspeed] .lpa-zt-fill{background:var(--lpa-zt-accent)}
.lpa-effort.lpa-zt[data-highspeed][data-max] .lpa-zt-fill::before{background:linear-gradient(90deg in oklab,var(--lpa-zt-accent) 0%,var(--lpa-zt-accent-alt) 100%)}
.lpa-zt-bubbles{position:absolute;inset:0;pointer-events:none}
.lpa-zt-bubble{position:absolute;left:0;right:0;opacity:0;animation:lpa-zt-bubble-flow linear infinite}
.lpa-zt-bubble>span{display:block;border-radius:9999px;background:#fff}
@keyframes lpa-zt-bubble-flow{0%{transform:translateX(104%);opacity:0}15%,80%{opacity:.4}100%{transform:translateX(-4%);opacity:0}}
.lpa-zt-stops{position:absolute;left:14px;right:14px;top:0;bottom:0;display:flex;align-items:center;justify-content:space-between;pointer-events:none}
.lpa-zt-stop{flex:none;width:4px;height:4px;border-radius:9999px;background:color-mix(in srgb,var(--lpa-zt-ink) 40%,transparent);transition:scale 120ms ease-out,opacity 120ms ease-out,background-color 120ms ease-out}
.lpa-zt-stop[data-filled]{background:#fff;opacity:.3}
.lpa-zt-stop[data-hovered]{scale:1.75;opacity:1}
.lpa-zt-thumb{position:absolute;top:2px;width:28px;height:28px;border-radius:9999px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:left 120ms ease-out;pointer-events:none}
.lpa-zt-input{position:absolute;inset:0;margin:0;width:100%;height:32px;cursor:pointer;appearance:none;-webkit-appearance:none;background:transparent;outline:none;font:inherit}
.lpa-zt-input:focus-visible{outline:2px solid color-mix(in srgb,var(--lpa-zt-ink) 40%,transparent);outline-offset:2px}
.lpa-zt-input::-webkit-slider-runnable-track{height:32px;background:transparent}
.lpa-zt-input::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:28px;height:28px;margin-top:2px;border:0;border-radius:50%;background:transparent}
.lpa-zt-input::-moz-range-track{height:32px;background:transparent}
.lpa-zt-input::-moz-range-thumb{width:28px;height:28px;border:0;border-radius:50%;background:transparent}
.lpa-zt-input::-moz-range-progress{background:transparent}
@media (prefers-reduced-motion:reduce){
  .lpa-zt-bubbles{display:none}
  .lpa-zt-bubble{animation:none}
  .lpa-zt-stop,.lpa-zt-thumb,.lpa-zt-fill,.lpa-zt-fill::before{transition:none}
}
`;
