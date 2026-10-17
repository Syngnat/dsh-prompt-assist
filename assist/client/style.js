export const css = `
.lpa.lpa-inline--undo{width:fit-content;max-width:calc(100% - 32px);padding:3px 6px;border-color:transparent;background:transparent}
.lpa-undo-actions{display:flex;justify-content:center;align-items:center}
.lpa-undo-actions>.lpa-button{width:auto;flex:none}

/* Native hero/composer docks are flex children: keep card chrome intact and shrink only its scrollable content. */
.lpa-inline{box-sizing:border-box;width:calc(100% - 32px);max-width:var(--dsh-composer-card-max-width,840px);margin:0 auto 8px;max-height:clamp(180px,38vh,320px);flex:none;overflow:auto;overscroll-behavior:contain;padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:8px}
.lpa-inline--pending{width:fit-content;max-width:calc(100% - 32px);padding:7px 12px;border-radius:24px}
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
.lpa-button[aria-pressed=true],.lpa-button--primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
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
`;
