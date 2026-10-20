// Component-owned CSS: the picker must work before the settings page is ever mounted.
export const pickerCss=`
.lpa-model-root{display:inline-flex;min-width:0}
.lpa-model-trigger{display:inline-flex;align-items:center;gap:5px;height:28px;max-width:min(320px,52cqw);min-width:0;padding:0 7px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;cursor:pointer}
.lpa-model-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.lpa-model-trigger:disabled{opacity:.5;cursor:default}
.lpa-model-trigger-label{display:var(--dsh-composer-model-text-display,block);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1}
.lpa-model-trigger-icon{display:var(--dsh-composer-model-icon-display,none)}
.lpa-model-trigger-effort{display:var(--dsh-composer-model-text-display,block);font-size:13px;line-height:1;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.lpa-model-chevron{flex:none;width:0;height:0;border-left:3.5px solid transparent;border-right:3.5px solid transparent;border-top:4px solid currentColor;transform:translateY(-2px)}
.lpa-model-menu{position:fixed;z-index:1200;display:flex;flex-direction:column;box-sizing:border-box;width:344px;max-width:calc(100vw - 16px);max-height:min(660px,calc(100vh - 16px));padding:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);box-shadow:0 8px 24px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:start;overflow:hidden}
.lpa-model-scroll{min-height:40px;overflow-y:auto;overscroll-behavior:contain;scroll-padding-block:26px;flex:1 1 auto}
.lpa-model-group{padding:0 0 4px}
.lpa-model-group-name{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:8px;min-height:28px;box-sizing:border-box;padding:6px 7px 4px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));font-size:12px;letter-spacing:0;font-weight:600;line-height:18px;color:var(--dsw-alias-label-primary,var(--dsw-alias-label-secondary))}
.lpa-model-group-name>span{min-width:0;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lpa-model-group-name::after{content:"";height:1px;flex:1;background:var(--dsw-alias-border-l1)}
.lpa-model-option{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;box-sizing:border-box;padding:5px 7px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:inherit;cursor:pointer}
.lpa-model-option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.lpa-model-option:focus-visible,.lpa-model-trigger:focus-visible,.lpa-model-retry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.lpa-model-option:disabled{opacity:.45;cursor:default}
.lpa-model-copy{display:flex;flex:1;flex-direction:column;gap:1px;min-width:0}
.lpa-model-name{font-size:13px;font-weight:500;line-height:17px;overflow-wrap:anywhere}
.lpa-model-desc{font-size:11px;font-weight:400;line-height:15px;white-space:normal;overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.lpa-model-check{flex:none;align-self:flex-start;margin-top:2px;font-size:13px;color:var(--dsw-alias-brand-primary)}
.lpa-model-status,.lpa-model-error{margin:0;padding:6px 8px;font-size:11px;line-height:16px;overflow-wrap:anywhere}
.lpa-model-status{color:var(--dsw-alias-label-secondary)}
.lpa-model-error{color:var(--dsw-alias-state-error-primary)}
.lpa-model-failures{flex:0 1 auto;max-height:100px;overflow:auto;border-top:1px solid var(--dsw-alias-border-l1)}
.lpa-model-retry{margin:2px 8px 6px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}
.lpa-effort-frame{flex:none;padding:10px 8px;border-top:1px solid var(--dsw-alias-border-l1)}
.lpa-model-more{display:grid;gap:1px;padding:2px 0 6px}
.lpa-model-provider-row{display:flex;align-items:center;gap:8px;width:100%;min-height:30px;box-sizing:border-box;padding:4px 7px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:inherit;cursor:pointer}
.lpa-model-provider-row:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.lpa-model-provider-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.lpa-model-provider-row:disabled{opacity:.45;cursor:default}
.lpa-model-provider-copy{display:flex;align-items:center;gap:6px;flex:1;min-width:0}
.lpa-model-provider-name{font-size:12.5px;font-weight:500;line-height:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lpa-model-provider-meta{flex:none;display:inline-flex;align-items:center;gap:7px}
.lpa-model-provider-count{font-size:10px;line-height:14px;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.lpa-model-provider-chevron{flex:none;font-size:13px;line-height:1;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.lpa-model-provider-row--current .lpa-model-provider-name,.lpa-model-provider-row--current .lpa-model-provider-chevron{color:var(--dsw-alias-brand-primary)}
.lpa-model-back-row{display:flex;align-items:center;gap:5px;width:100%;min-height:26px;box-sizing:border-box;padding:4px 7px 2px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary));font:inherit;font-size:11.5px;text-align:inherit;cursor:pointer}
.lpa-model-back-row:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.lpa-model-back-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.lpa-model-back-row:disabled{opacity:.45;cursor:default}
.lpa-model-back-chevron{flex:none;font-size:13px;line-height:1}
.lpa-model-pin{flex:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;height:18px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;line-height:1;cursor:pointer}
.lpa-model-pin:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}
.lpa-model-pin:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.lpa-model-pin[aria-pressed="true"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
`;
