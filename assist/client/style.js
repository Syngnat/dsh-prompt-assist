export const css = `
.lpa.lpa-inline--undo{width:fit-content;max-width:calc(100% - 32px);padding:3px 6px;border-color:transparent;background:transparent}
.lpa-undo-actions{display:flex;justify-content:center;align-items:center}
.lpa-undo-actions>.lpa-button{width:auto;flex:none}

/* Native hero/composer docks are flex children: keep card chrome intact and shrink only its scrollable content. */
.lpa-inline{box-sizing:border-box;width:calc(100% - 32px);max-width:var(--dsh-composer-card-max-width,840px);margin:0 auto 8px;max-height:clamp(180px,38vh,320px);flex:none;overflow:auto;overscroll-behavior:contain;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:8px}
.lpa-inline--pending{width:fit-content;max-width:calc(100% - 32px);padding:7px 12px;border-radius:24px}
/* Only our result floats in the native, zero-height composer overlay. Native menus stay above it. */
.lpa-result-anchor{position:absolute;inset-inline:0;bottom:8px;z-index:90;display:flex;flex-direction:column;align-items:stretch;pointer-events:none}
.lpa-result-anchor>.lpa-inline{width:100%;max-width:none;margin:0;max-height:min(clamp(180px,38vh,320px),var(--lpa-result-height,320px));pointer-events:auto}
.lpa-result-anchor>.lpa-inline--pending,.lpa-result-anchor>.lpa-inline--undo{width:fit-content;max-width:100%;align-self:center}
.lpa-inline .lpa-pending{justify-content:space-between;gap:12px}
.lpa-pending-mark{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary);flex:none}
.lpa-settings-page{box-sizing:border-box;width:100%;height:100%;overflow:auto;padding:28px;max-width:1120px;margin:0 auto;font-size:14px}
.lpa-settings-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}
.lpa-settings-header h1{font-size:22px;margin:0}
.lpa-settings-page :is(code,small){overflow-wrap:anywhere}
.lpa-settings-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr));gap:20px;margin-top:24px}
.lpa-settings-cards .lpa-feature{padding:20px;gap:14px;display:flex;flex-direction:column}
.lpa-settings-cards .lpa-feature-title{font-size:16px}
@media(max-width:600px){.lpa-settings-page{padding:16px}}
.lpa{font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);min-width:0}
.lpa-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-width:0}.lpa-row--spread{justify-content:space-between}
.lpa-button{font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);background:transparent;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;padding:4px 8px;min-height:28px;cursor:pointer}
.lpa-button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.lpa-button[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.lpa-button:disabled{opacity:.5;cursor:default}.lpa :is(button,input,select,summary):focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.lpa-note{margin:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.5}.lpa-error{color:var(--dsw-alias-state-error-primary);margin:0}
.lpa-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.lpa-field{display:grid;gap:4px;min-width:0}
.lpa-field :is(select,input){box-sizing:border-box;width:100%;min-width:0;min-height:28px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:3px 6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit}
.lpa-check{display:flex;align-items:center;gap:6px;line-height:1.5}.lpa-check input{accent-color:var(--dsw-alias-brand-primary)}
.lpa-preview{display:flex;flex-direction:column;gap:10px;min-width:0;min-height:0}
.lpa-preview>.lpa-result-text{flex:0 1 auto;min-height:1.6em}
.lpa-preview>.lpa-note{flex-shrink:0}
.lpa-preview-header{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:600}
.lpa-preview-status{font-size:11px;font-weight:400;color:var(--dsw-alias-label-secondary)}
.lpa-preview pre{font:inherit;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;max-height:160px;overflow:auto;margin:0;padding:0;user-select:text}
.lpa-preview-actions{flex-shrink:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.lpa-preview-meta{flex-shrink:0;max-height:min(120px,14vh);overflow:auto;display:flex;gap:12px;flex-wrap:wrap;color:var(--dsw-alias-label-secondary);font-size:11px}
.lpa-preview-meta details{min-width:0}
.lpa-preview-meta details[open]{flex-basis:100%}
.lpa-preview-meta summary{cursor:pointer;width:fit-content}
.lpa-preview-meta pre,.lpa-preview-meta p{margin:7px 0 0}
.lpa-preview-meta pre{max-height:120px;padding:8px;background:var(--dsw-alias-bg-layer-2);border-radius:6px}
.lpa-reference{padding:5px 0;overflow-wrap:anywhere}
.lpa-details{border-top:1px solid var(--dsw-alias-border-l1);padding-top:7px}.lpa-details summary{cursor:pointer;color:var(--dsw-alias-label-secondary)}
.lpa-features{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(250px,100%),1fr));gap:10px;align-items:start;min-width:0}
.lpa-feature{display:grid;gap:8px;min-width:0;align-content:start;padding:9px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1)}
.lpa-feature-title{font:inherit;font-size:12px;font-weight:600;margin:0;color:var(--dsw-alias-label-primary)}
.lpa-feature form,.lpa-feature-actions{display:grid;gap:8px;min-width:0}
.lpa-feature .lpa-grid{grid-template-columns:minmax(0,1fr)}
.lpa-settings-cards .lpa-feature>form{display:flex;flex-direction:column;flex:1;gap:8px}
.lpa-settings-cards .lpa-feature>form>.lpa-button--primary{margin-top:auto;align-self:flex-end;min-width:112px;width:auto}
.lpa-settings-feedback{display:grid;gap:6px;min-height:1.5em}
@supports(grid-template-rows:subgrid){.lpa-settings-cards .lpa-feature{display:grid;grid-row:span 4;grid-template-rows:subgrid;align-content:normal}}
@media(max-width:520px){.lpa-grid{grid-template-columns:minmax(0,1fr)}.lpa-inline{padding:8px}}

.lpa-update-panel{display:grid;gap:12px;margin-top:28px;padding:20px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-1);min-width:0}
.lpa-update-title{font:inherit;font-size:16px;font-weight:600;margin:0}
.lpa-update-versions{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr));gap:12px;margin:0}
.lpa-update-field{min-width:0}.lpa-update-field dt{font-size:11px;color:var(--dsw-alias-label-secondary);margin-bottom:4px}.lpa-update-field dd{margin:0;overflow-wrap:anywhere}
.lpa-update-install{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}.lpa-update-install code{overflow-wrap:anywhere;user-select:text}
.lpa-update-guide summary{cursor:pointer;color:var(--dsw-alias-label-secondary)}.lpa-update-guide ol{padding-inline-start:20px;margin:10px 0}.lpa-update-guide li{margin:7px 0;line-height:1.5}
.lpa-update-panel a.lpa-button{text-decoration:none;display:inline-flex;align-items:center}
.lpa-update-history{box-sizing:border-box;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary)}
.lpa-update-history summary{cursor:pointer;overflow-wrap:anywhere}
.lpa-update-history[open] summary{margin-bottom:8px}
.lpa-update-history .lpa-update-versions{margin:8px 0}
/* Filled actions retain their own foreground during hover; warning rim distinguishes profile-wide confirmation. */
.lpa-button.lpa-button--primary{box-sizing:border-box;max-width:100%;white-space:normal;overflow-wrap:anywhere;background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-layer-1);font-weight:700;padding:8px 14px;min-height:36px}
.lpa-button.lpa-button--primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 88%,var(--dsw-alias-label-primary));color:var(--dsw-alias-bg-layer-1)}
.lpa-button.lpa-button--primary:active:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 76%,var(--dsw-alias-label-primary));box-shadow:inset 0 2px 3px var(--dsw-alias-bg-overlay)}
.lpa-button.lpa-button--danger{border:3px solid var(--dsw-alias-state-warn-primary);padding:6px 12px;box-shadow:0 0 0 1px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 35%,var(--dsw-alias-bg-layer-1))}
.lpa-button.lpa-button--primary:disabled{opacity:1;background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);box-shadow:none;cursor:not-allowed}
.lpa-update-panel{box-sizing:border-box;overflow-wrap:anywhere}
.lpa-update-panel .lpa-button{box-sizing:border-box;max-width:100%;white-space:normal;overflow-wrap:anywhere}
.lpa-update-banner,.lpa-update-summary--available{box-sizing:border-box;min-width:0;padding:16px;border:1px solid var(--dsw-alias-brand-primary);border-inline-start-width:4px;border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary)}
.lpa-update-banner{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:12px}
.lpa-update-badge{justify-self:start;max-width:100%;box-sizing:border-box;padding:4px 9px;border-radius:20px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-layer-1);font-size:11px;font-weight:700;line-height:1.5}
.lpa-update-banner-copy{min-width:0;display:grid;gap:6px}
.lpa-update-banner-copy h4,.lpa-update-review h4{margin:0;font-size:15px;font-weight:700}
.lpa-update-banner-copy p,.lpa-update-summary p{margin:0;line-height:1.6}
.lpa-update-summary{display:grid;gap:6px}.lpa-update-summary strong{font-size:15px;color:var(--dsw-alias-brand-primary)}
.lpa-update-field--highlight{padding:10px 12px;border-radius:7px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2)}
.lpa-update-field--highlight dd{color:var(--dsw-alias-brand-primary);font-weight:700;font-size:16px}
.lpa-update-review{display:grid;min-width:0;gap:14px;padding:18px;border:1px solid var(--dsw-alias-border-l2);border-inline-start:4px solid var(--dsw-alias-state-warn-primary);border-radius:9px;background:var(--dsw-alias-bg-layer-2)}
.lpa-update-risk{margin:0;color:var(--dsw-alias-state-warn-primary);font-weight:600;line-height:1.6}
.lpa-update-consent{box-sizing:border-box;min-width:0;margin:0;padding:12px;border:1px solid var(--dsw-alias-state-warn-primary);border-radius:7px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 8%,var(--dsw-alias-bg-layer-1))}
.lpa-update-consent legend{max-width:100%;padding:0 6px;font-weight:700;color:var(--dsw-alias-state-warn-primary);overflow-wrap:anywhere}
.lpa-update-consent>.lpa-row{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:start;gap:9px;line-height:1.6;color:var(--dsw-alias-label-primary)}
.lpa-update-consent input{margin:3px 0 0;accent-color:var(--dsw-alias-state-warn-primary)}
@media(max-width:600px){.lpa-update-panel{padding:12px;margin-top:18px}.lpa-update-banner{grid-template-columns:minmax(0,1fr);gap:8px}.lpa-update-review{padding:12px}.lpa-update-versions{grid-template-columns:minmax(0,1fr)}.lpa-update-panel>.lpa-row,.lpa-update-review>.lpa-row{align-items:stretch}.lpa-update-panel>.lpa-row>.lpa-button,.lpa-update-review>.lpa-row>.lpa-button{width:100%}.lpa-update-install>.lpa-button{max-width:100%}}

/* Settings card system: all color comes from the active DSH theme. */
.lpa.lpa-settings-page{font-size:14px;line-height:1.55}
.lpa-settings-header{align-items:flex-start;gap:20px;margin-bottom:24px}.lpa-settings-heading{display:grid;gap:8px;flex:1 1 520px;min-width:0}.lpa-settings-header h1{font-size:24px;font-weight:650;line-height:1.3;letter-spacing:-.02em}.lpa-settings-header>.lpa-button{flex:none;align-self:flex-start;min-height:32px;padding:6px 10px}
.lpa-settings-header .lpa-settings-subtitle{font-size:12px;color:var(--dsw-alias-label-secondary);max-width:80ch}
.lpa-settings-sections{display:grid;gap:16px;min-width:0}
.lpa-card{box-sizing:border-box;display:grid;gap:16px;min-width:0;margin:0;padding:20px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.lpa-card-header{display:grid;gap:6px;min-width:0}.lpa-card-title{font:inherit;font-size:16px;font-weight:650;line-height:1.4;color:var(--dsw-alias-label-primary);margin:0}
.lpa-card .lpa-note{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}.lpa-card .lpa-field>strong{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.lpa-settings-cards{gap:16px;margin-top:16px;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))}
.lpa-empty-state{text-align:center;padding:28px 16px;border:1px dashed var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-2)}
.lpa-switches{display:grid;gap:0;align-items:stretch;min-width:0}.lpa-switch-row{display:grid;grid-template-columns:minmax(0,1fr) 40px;align-items:center;gap:16px;padding:14px 0;margin:0;cursor:pointer}.lpa-switch-row+.lpa-switch-row{border-top:1px solid var(--dsw-alias-border-l1)}.lpa-switch-copy{display:grid;gap:4px;min-width:0}.lpa-switch-copy strong{font-size:13px;font-weight:600}
.lpa-switch{appearance:none;-webkit-appearance:none;box-sizing:border-box;display:block;width:40px;height:22px;min-width:40px;flex:none;margin:0;padding:2px;border:1px solid var(--dsw-alias-border-l2);border-radius:22px;background:var(--dsw-alias-bg-layer-2);cursor:pointer}
.lpa-switch::before{content:"";display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .15s ease}.lpa-switch:checked{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}.lpa-switch:checked::before{transform:translateX(18px);background:var(--dsw-alias-bg-layer-1)}.lpa-switch:disabled{opacity:.5;cursor:not-allowed}.lpa-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:3px}
.lpa-footnote{display:grid;gap:6px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}.lpa-card .lpa-footnote .lpa-note,.lpa-card .lpa-footnote-details .lpa-note{font-size:11px;color:var(--dsw-alias-label-tertiary)}
.lpa-footnote-details{font-size:12px;color:var(--dsw-alias-label-secondary)}.lpa-footnote-details summary{cursor:pointer;width:fit-content}.lpa-footnote-details .lpa-note{margin-top:8px}
.lpa-chip-list{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8px 12px;min-width:0}.lpa-provider-item{display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0;max-width:100%}
.lpa-chip{box-sizing:border-box;display:inline-flex;align-items:center;gap:8px;min-height:28px;max-width:100%;min-width:0;padding:4px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-2);font-size:12px}.lpa-chip--readonly{color:var(--dsw-alias-label-secondary)}.lpa-chip code{overflow-wrap:anywhere}.lpa-card .lpa-chip-models{font-size:11px;overflow-wrap:anywhere}.lpa-chip .lpa-chip-action{min-height:24px;padding:2px 6px;border-color:transparent;border-radius:4px;font-size:11px}
.lpa-card-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px;min-width:0}.lpa-card-actions>.lpa-button:not(.lpa-button--primary){min-height:32px;padding:6px 10px}
.lpa-priority-actions{display:grid;gap:12px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l1)}.lpa-priority-actions .lpa-action-buttons{justify-content:flex-end}.lpa-priority-actions .lpa-check{align-items:flex-start;gap:10px;font-size:12px}.lpa-priority-actions .lpa-check input{flex:none;margin-top:3px}.lpa-card .lpa-field select{min-height:34px;padding:6px 8px}
.lpa-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.lpa-stat{min-width:0;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2)}.lpa-stat dt{margin-bottom:6px;color:var(--dsw-alias-label-secondary)}.lpa-stat dd{font-size:18px;font-weight:650;line-height:1.5;color:var(--dsw-alias-label-primary)}.lpa-stat time{font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}.lpa-stat.lpa-stat--highlight{border-color:var(--dsw-alias-brand-primary)}.lpa-stat.lpa-stat--highlight dd{color:var(--dsw-alias-brand-primary)}
.lpa-divider{height:0;min-width:0;margin-top:6px;border-top:1px solid var(--dsw-alias-border-l1)}.lpa-subsection{display:grid;gap:12px;min-width:0;padding:0;margin:0;border:0;background:none}.lpa-subsection-title{font:inherit;font-size:15px;font-weight:650;line-height:1.5;margin:0;color:var(--dsw-alias-label-primary)}
.lpa-install-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px 12px;padding-top:8px;min-width:0}.lpa-install-row>span:first-child{grid-column:1/-1;font-size:11px;color:var(--dsw-alias-label-secondary)}.lpa-install-row code{box-sizing:border-box;min-width:0;max-width:100%;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-2);white-space:nowrap;overflow-x:auto;user-select:text;font-size:12px}.lpa-install-row>.lpa-button{white-space:nowrap;min-height:32px}.lpa-install-row>[role=status]{grid-column:1/-1}
@media(max-width:720px){.lpa.lpa-settings-page{padding:16px}.lpa-settings-header{flex-direction:column;align-items:stretch;gap:12px}.lpa-settings-heading{flex-basis:auto}.lpa-settings-header>.lpa-button{max-width:100%}.lpa-card{padding:18px}.lpa-stats,.lpa-settings-cards{grid-template-columns:minmax(0,1fr)}.lpa-card-actions{align-items:stretch}.lpa-card-actions>.lpa-button,.lpa-card-actions>.lpa-row>.lpa-button{flex:1 1 160px}.lpa-provider-item{flex-basis:100%}.lpa-settings-cards{margin-top:8px}}
@media(forced-colors:active){.lpa-switch{appearance:auto;-webkit-appearance:auto}.lpa-switch::before{display:none}}
`;
