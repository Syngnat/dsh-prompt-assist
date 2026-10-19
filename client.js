window.__ModuleLoader__.load({id:"@local/dsh-openai-fast",factory(require){var module={exports:{}};var exports=module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// assist/identity.js
var ASSIST_KEY, ASSIST_COMMAND, ASSIST_CHANNEL, ASSIST_ENDPOINT, LEGACY_COMMAND, ENABLEMENT_PATH, PRIORITY_ENDPOINT;
var init_identity = __esm({
  "assist/identity.js"() {
    ASSIST_KEY = "local.promptAssist.v2";
    ASSIST_COMMAND = "prompt-assist-config-v2";
    ASSIST_CHANNEL = "/api";
    ASSIST_ENDPOINT = "local-openai-fast.assist";
    LEGACY_COMMAND = "prompt-assist-config";
    ENABLEMENT_PATH = "/api/local-openai-fast.enablement";
    PRIORITY_ENDPOINT = "local-openai-fast.priority";
  }
});

// policy.js
function isOpenAIModel(model) {
  return typeof model === "string" && /^(?:gpt-|chatgpt-|codex(?:-|$)|o[1-9](?:-|$))/i.test(model);
}
var DEFAULT_PROVIDERS;
var init_policy = __esm({
  "policy.js"() {
    DEFAULT_PROVIDERS = Object.freeze(["openai", "openai-codex"]);
  }
});

// assist/client/priority-source.js
function notifyPriorityChanged() {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
    }
  }
}
function onPriorityChanged(listener) {
  if (typeof listener !== "function") return () => {
  };
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function createPrioritySource(connection) {
  let snapshot = Object.freeze({ status: "idle", revision: null, authorized: Object.freeze([]), effective: Object.freeze([]) });
  const subscribers = /* @__PURE__ */ new Set();
  let epoch = 0, disposed = false, inflight = null;
  const publish = (next) => {
    snapshot = Object.freeze(next);
    for (const notify of [...subscribers]) {
      try {
        notify();
      } catch {
      }
    }
  };
  function refresh() {
    if (disposed || !connection?.rpc?.call) return Promise.resolve(snapshot);
    if (inflight) return inflight;
    const token = ++epoch;
    inflight = (async () => {
      try {
        const result = await connection.rpc.call(ASSIST_CHANNEL, PRIORITY_ENDPOINT, { action: "snapshot" });
        if (disposed || token !== epoch) return snapshot;
        if (result?.ok !== true) {
          publish({ ...snapshot, status: "error" });
          return snapshot;
        }
        const value = result.value;
        publish({
          status: "ready",
          revision: Number.isSafeInteger(value?.revision) ? value.revision : null,
          authorized: Object.freeze(ids(value?.authorized)),
          effective: Object.freeze(ids(value?.effective))
        });
      } catch {
        if (!disposed && token === epoch) publish({ ...snapshot, status: "error" });
      } finally {
        if (token === epoch) inflight = null;
      }
      return snapshot;
    })();
    return inflight;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    refresh,
    dispose() {
      disposed = true;
      epoch += 1;
      inflight = null;
      subscribers.clear();
    }
  };
}
var listeners, ids;
var init_priority_source = __esm({
  "assist/client/priority-source.js"() {
    init_identity();
    listeners = /* @__PURE__ */ new Set();
    ids = (value) => Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string"))] : [];
  }
});

// assist/client/editor.js
function captureText(input, actions) {
  const span = actions.captureInsertion();
  if (span.draftRev !== input.draftRev) return null;
  return {
    original: input.draft,
    draftRev: span.draftRev,
    structured: input.occurrences.length > 0 || Boolean(input.claim),
    span: { ...span, start: 0, end: input.draft.length }
  };
}
function applyText(snapshot, text, readInput, actions) {
  if (!snapshot || snapshot.structured || typeof text !== "string") return { ok: false, reason: "structured" };
  if (/[\uE100-\uE11D\uFFFC]/u.test(text)) return { ok: false, reason: "structured" };
  const input = readInput();
  const live = actions.captureInsertion();
  if (input.draft !== snapshot.original || input.draftRev !== snapshot.draftRev || live.draftRev !== snapshot.draftRev) return { ok: false, reason: "stale" };
  if (input.occurrences.length || input.claim) return { ok: false, reason: "structured" };
  if (!actions.insertText(text, snapshot.span)) return { ok: false, reason: "stale" };
  const after = actions.captureInsertion();
  return { ok: true, undo: {
    original: text,
    draftRev: after.draftRev,
    structured: false,
    span: { ...after, start: 0, end: text.length },
    replacement: snapshot.original
  } };
}
function undoText(undo, readInput, actions) {
  return applyText(undo, undo?.replacement, readInput, actions);
}
function sameInput(a, b) {
  return a.draft === b.draft && a.draftRev === b.draftRev && a.phase === b.phase && JSON.stringify(a.attachmentIds) === JSON.stringify(b.attachmentIds) && JSON.stringify(a.occurrences) === JSON.stringify(b.occurrences) && Boolean(a.claim) === Boolean(b.claim);
}
function canSuggest(input) {
  return input.draft === "" && input.attachmentIds.length === 0 && input.occurrences.length === 0 && !input.claim && input.phase === "plain";
}
function ownsResult(value, sessionId) {
  return value?.sessionId === sessionId;
}
var init_editor = __esm({
  "assist/client/editor.js"() {
  }
});

// assist/client/enhance-action.js
function enhanceAvailability(r) {
  let reason = !r.allowed ? "access" : !r.state ? "load" : !r.settings.enhance.enabled ? "enableEnhance" : r.dirty ? "settingsChanged" : !r.input.draft.trim() ? "empty" : r.input.phase !== "plain" ? "busy" : r.result.pending ? "generating" : "generate";
  return { ready: reason === "generate", pending: r.result.pending === "enhance", reason };
}
function createEnhanceAction() {
  let handler = null, running = false, base = { ready: false, pending: false, reason: "load" };
  let snapshot = base;
  const listeners2 = /* @__PURE__ */ new Set();
  const publish = () => {
    const next = { ...base, ready: base.ready && !running, pending: base.pending || running };
    if (JSON.stringify(next) === JSON.stringify(snapshot)) return;
    snapshot = next;
    listeners2.forEach((fn) => fn());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) {
      listeners2.add(fn);
      return () => listeners2.delete(fn);
    },
    update(value, run) {
      base = value;
      handler = run;
      publish();
    },
    clear() {
      handler = null;
      base = { ready: false, pending: false, reason: "load" };
      publish();
    },
    async run() {
      if (!snapshot.ready || !handler) return false;
      const invoke = handler;
      running = true;
      publish();
      try {
        return await invoke();
      } finally {
        running = false;
        publish();
      }
    }
  };
}
function suggestAvailability(r) {
  const reason = !r.allowed ? "access" : !r.state ? "load" : !r.settings.suggest.enabled ? "enableSuggest" : r.busy ? "busy" : r.dirty ? "settingsChanged" : !canSuggest(r.input) ? "draftOccupied" : !r.state.qaCount ? "contextError" : r.result.pending ? "generating" : "generateSuggest";
  return { ready: reason === "generateSuggest", pending: r.result.pending === "suggest", reason };
}
var init_enhance_action = __esm({
  "assist/client/enhance-action.js"() {
    init_editor();
  }
});

// assist/client/style.js
var css;
var init_style = __esm({
  "assist/client/style.js"() {
    css = `
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
/* Filled actions retain their own foreground during hover; warning rim distinguishes profile-wide confirmation. */
.lpa-button.lpa-button--primary{box-sizing:border-box;max-width:100%;white-space:normal;overflow-wrap:anywhere;background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-layer-1);font-weight:700;padding:8px 14px;min-height:36px}
.lpa-button.lpa-button--primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 88%,var(--dsw-alias-label-primary));color:var(--dsw-alias-bg-layer-1)}
.lpa-button.lpa-button--primary:active:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-brand-primary) 76%,var(--dsw-alias-label-primary));box-shadow:inset 0 2px 3px var(--dsw-alias-bg-overlay)}
.lpa-button.lpa-button--danger{border:3px solid var(--dsw-alias-state-warn-primary);padding:6px 12px;box-shadow:0 0 0 1px color-mix(in srgb,var(--dsw-alias-state-warn-primary) 35%,var(--dsw-alias-bg-layer-1))}
.lpa-button.lpa-button--primary:disabled{opacity:1;background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);box-shadow:none;cursor:not-allowed}
.lpa-update-panel{box-sizing:border-box;overflow-wrap:anywhere}
.lpa-update-panel>.lpa-update-panel{margin-top:8px}
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
`;
  }
});

// assist/client/enhance-button.js
function EnhanceButton(p) {
  const state = import_react.default.useSyncExternalStore(p.assistEnhance.subscribe, p.assistEnhance.getSnapshot, p.assistEnhance.getSnapshot);
  const session = p.useSession((s) => s);
  if (session?.subagent || session?.removed) return null;
  return h("span", { className: "lpa" }, h("style", null, css), h("button", {
    type: "button",
    className: "lpa-button",
    disabled: !state.ready,
    "aria-busy": state.pending,
    title: p.t(state.reason),
    onClick: () => {
      void p.assistEnhance.run();
    }
  }, h("span", { "aria-hidden": true }, "\u2728 "), p.t(state.pending ? "enhancing" : "enhance")));
}
var import_react, h;
var init_enhance_button = __esm({
  "assist/client/enhance-button.js"() {
    import_react = __toESM(require("react"), 1);
    init_style();
    h = import_react.default.createElement;
  }
});

// assist/client/suggest-button.js
function SuggestButton(p) {
  const state = import_react2.default.useSyncExternalStore(p.assistSuggest.subscribe, p.assistSuggest.getSnapshot, p.assistSuggest.getSnapshot);
  const session = p.useSession((s) => s);
  if (session?.subagent || session?.removed) return null;
  return h2("span", { className: "lpa" }, h2("style", null, css), h2("button", { type: "button", className: "lpa-button", disabled: !state.ready, "aria-busy": state.pending, title: p.t(state.reason), onClick: () => {
    void p.assistSuggest.run();
  } }, h2("span", { "aria-hidden": true }, "\u{1F4A1} "), p.t(state.pending ? "generatingSuggest" : "suggest")));
}
var import_react2, h2;
var init_suggest_button = __esm({
  "assist/client/suggest-button.js"() {
    import_react2 = __toESM(require("react"), 1);
    init_style();
    h2 = import_react2.default.createElement;
  }
});

// assist/stream-transport.js
async function streamAssist(fetcher, sessionId, input, signal, onText) {
  const response = await fetcher(STREAM_PATH.slice(1), { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, sessionId, action: "generate" }), signal });
  if (!response.ok || !response.body) throw Object.assign(new Error("transport-unavailable"), { code: "transport-unavailable" });
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", text = "", result, complete = false;
  const accept = (line) => {
    if (!line) return;
    const frame = JSON.parse(line);
    signal?.throwIfAborted();
    if (frame.type === "delta" && typeof frame.text === "string") {
      text += frame.text;
      onText(text);
    } else if (frame.type === "text" && typeof frame.text === "string") {
      text = frame.text;
      onText(text);
    } else if (frame.type === "result") {
      result = frame.value;
      complete = true;
    } else if (frame.type === "error") throw Object.assign(new Error(frame.code), { code: frame.code });
  };
  try {
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        accept(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
      }
    }
    buffer += decoder.decode();
    if (buffer) accept(buffer);
    if (!complete) throw Object.assign(new Error("incomplete-stream"), { code: "transport-incomplete" });
    return result;
  } finally {
    await reader.cancel().catch(() => {
    });
    reader.releaseLock();
  }
}
var STREAM_PATH;
var init_stream_transport = __esm({
  "assist/stream-transport.js"() {
    STREAM_PATH = "/api/local-openai-fast.stream";
  }
});

// assist/rpc-transport.js
function createAssistRpcApi(connection, fetcher = (...args) => globalThis.fetch(...args)) {
  return async (action, sessionId, input = {}, signal, onText) => {
    if (action === "generate" && typeof onText === "function") return streamAssist(fetcher, sessionId, input, signal, onText);
    let result;
    try {
      result = await connection.rpc.call(
        ASSIST_CHANNEL,
        ASSIST_ENDPOINT,
        { ...input, action, sessionId },
        signal
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      throw Object.assign(new Error("transport-unavailable"), { code: "transport-unavailable" });
    }
    if (result?.ok !== true) {
      const code2 = result?.error?.code ?? "transport-invalid-response";
      throw Object.assign(new Error(code2), { code: code2 });
    }
    return result.value;
  };
}
var init_rpc_transport = __esm({
  "assist/rpc-transport.js"() {
    init_stream_transport();
    init_identity();
  }
});

// assist/client/messages.js
var NS, dictionaries;
var init_messages = __esm({
  "assist/client/messages.js"() {
    NS = "local-prompt-assist";
    dictionaries = {
      zh: {
        "global.title": "\u5168\u5C40\u529F\u80FD\u5F00\u5173\uFF08\u5F53\u524D profile\uFF09",
        "global.scope": "\u8FD9\u4E24\u4E2A\u5F00\u5173\u7ACB\u5373\u4FDD\u5B58\u5E76\u4F5C\u7528\u4E8E\u5F53\u524D profile \u7684\u6240\u6709\u73B0\u6709\u548C\u65B0\u5EFA\u4F1A\u8BDD\uFF0C\u65E0\u9700\u5148\u9009\u62E9\u4F1A\u8BDD\u3002\u6A21\u578B\u3001\u63A8\u7406\u6863\u3001\u8F85\u52A9 Fast \u548C\u95EE\u7B54\u8F6E\u6570\u4ECD\u5206\u522B\u6309\u4F1A\u8BDD\u8BBE\u7F6E\u3002",
        "global.charge": "\u5F00\u542F\u4E0B\u4E00\u95EE\u5EFA\u8BAE\u540E\uFF0C\u5404\u4F1A\u8BDD\u5728\u65B0\u7684\u5B8C\u6574\u95EE\u7B54\u7ED3\u675F\u3001\u7A7A\u95F2\u4E14\u8349\u7A3F\u4E3A\u7A7A\u65F6\u53EF\u81EA\u52A8\u8BF7\u6C42\u6A21\u578B\u5E76\u4EA7\u751F\u8D39\u7528\uFF1B\u589E\u5F3A\u4ECD\u53EA\u5728\u4E3B\u52A8\u70B9\u51FB\u65F6\u8BF7\u6C42\u3002\u5173\u95ED\u4F1A\u53D6\u6D88\u8BE5\u529F\u80FD\u7684\u8FC7\u671F\u7ED3\u679C\u3002",
        "global.suggest": "\u5168\u5C40\u542F\u7528\u4E0B\u4E00\u95EE\u5EFA\u8BAE",
        "global.enhance": "\u5168\u5C40\u542F\u7528\u63D0\u793A\u8BCD\u589E\u5F3A",
        "global.migration": "\u9996\u6B21\u5168\u5C40\u5F00\u5173\u9ED8\u8BA4\u5173\u95ED\uFF1B\u65E7\u4F1A\u8BDD\u7684\u542F\u7528\u6807\u8BB0\u4E0D\u4F1A\u81EA\u52A8\u8FC1\u79FB\u3002\u9700\u8981\u65F6\u5728\u8FD9\u91CC\u5F00\u542F\u4E00\u6B21\uFF0C\u65B0\u65E7\u4F1A\u8BDD\u5171\u540C\u7EE7\u627F\u3002\u5F00\u542F\u6216\u91CD\u8FDE\u4E0D\u4F1A\u8FFD\u6EAF\u5386\u53F2\u95EE\u7B54\u3002",
        "global.loading": "\u6B63\u5728\u8BFB\u53D6\u5168\u5C40\u5F00\u5173\u5E76\u8FDE\u63A5\u540C\u6B65\u2026",
        "global.disconnected": "\u5168\u5C40\u540C\u6B65\u6682\u4E0D\u53EF\u7528\uFF1B\u4E0B\u65B9\u53EF\u80FD\u663E\u793A\u4E0A\u6B21\u786E\u8BA4\u503C\uFF0C\u4F46\u5404\u4F1A\u8BDD\u6682\u4E0D\u542F\u7528\u8F85\u52A9\u8BF7\u6C42\u3002\u6062\u590D\u8FDE\u63A5\u53EA\u91CD\u8BFB\u72B6\u6001\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u4FDD\u5B58\u3002",
        "global.saving": "\u6B63\u5728\u4FDD\u5B58\u5168\u5C40\u5F00\u5173\u2026",
        "global.saved": "\u5168\u5C40\u5F00\u5173\u5DF2\u7531\u5BBF\u4E3B\u786E\u8BA4\u4FDD\u5B58\u3002",
        "global.saveFailed": "\u672A\u786E\u8BA4\u4FDD\u5B58\u6210\u529F\uFF0C\u4E0D\u80FD\u89C6\u4E3A\u5F00\u5173\u5DF2\u66F4\u6539\uFF1B\u8BF7\u91CD\u8BFB\u72B6\u6001\u540E\u624B\u52A8\u91CD\u8BD5\u3002\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u4FDD\u5B58\u3002",
        "global.stale": "\u5176\u4ED6\u7A97\u53E3\u5DF2\u66F4\u65B0\u5168\u5C40\u5F00\u5173\u3002\u672C\u6B21\u65E7\u7248\u672C\u64CD\u4F5C\u672A\u4F5C\u4E3A\u5F53\u524D\u4FDD\u5B58\u6210\u529F\u5904\u7406\uFF1B\u8BF7\u91CD\u8BFB\u5E76\u6838\u5BF9\u540E\u518D\u64CD\u4F5C\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u4FDD\u5B58\u3002",
        "global.reload": "\u91CD\u8BFB\u5168\u5C40\u5F00\u5173",
        "online.confirmationRejected": "\u5BBF\u4E3B\u660E\u786E\u62D2\u7EDD\u4E86\u672C\u6B21\u786E\u8BA4\uFF0C\u672A\u4E3A\u6B64\u8BF7\u6C42\u542F\u52A8\u66F4\u65B0\u4EFB\u52A1\u3002\u8BF7\u91CD\u65B0\u8BFB\u53D6\u72B6\u6001\uFF0C\u7136\u540E\u91CD\u65B0\u51C6\u5907\u5E76\u786E\u8BA4\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8BD5\u3002\u9519\u8BEF\u7801\uFF1A",
        "online.forgetWarning": "\u82E5\u8BB0\u5F55\u65E0\u6CD5\u6062\u590D\uFF0C\u8BF7\u5148\u5728\u63D2\u4EF6\u7BA1\u7406\u4E2D\u4EBA\u5DE5\u6838\u5BF9\u5B9E\u9645\u5B89\u88C5\u7248\u672C\u5E76\u786E\u8BA4\u6CA1\u6709\u66F4\u65B0\u4EFB\u52A1\u4ECD\u5728\u6267\u884C\u3002\u6E05\u9664\u4EC5\u79FB\u9664\u672C\u6807\u7B7E\u9875\u7684\u672C\u5730\u8DDF\u8E2A\u6807\u8BB0\uFF0C\u4E0D\u4EE3\u8868\u66F4\u65B0\u6210\u529F\uFF0C\u4E0D\u4F1A\u53D6\u6D88\u3001\u542F\u52A8\u6216\u91CD\u8BD5\u4EFB\u4F55\u5BBF\u4E3B\u4EFB\u52A1\u3002\u987B\u5148\u6210\u529F\u91CD\u8BFB\u72B6\u6001\uFF0C\u4E14\u6CA1\u6709\u6D3B\u52A8\u4EFB\u52A1\uFF0C\u624D\u80FD\u6E05\u9664\u3002",
        "online.forgetAcknowledgement": "\u6211\u5DF2\u4EBA\u5DE5\u6838\u5BF9\u5B89\u88C5\u72B6\u6001\uFF0C\u786E\u8BA4\u6CA1\u6709\u66F4\u65B0\u4EFB\u52A1\u4ECD\u5728\u6267\u884C\uFF0C\u5E76\u7406\u89E3\u6E05\u9664\u6807\u8BB0\u4E0D\u662F\u66F4\u65B0\u7ED3\u679C\u3002",
        "online.forgetMarker": "\u4EC5\u6E05\u9664\u672C\u5730\u8DDF\u8E2A\u6807\u8BB0",
        "online.markerCleared": "\u672C\u5730\u8DDF\u8E2A\u6807\u8BB0\u5DF2\u6E05\u9664\uFF0C\u5BBF\u4E3B\u4EFB\u52A1\u672A\u88AB\u66F4\u6539\uFF0C\u66F4\u65B0\u6210\u529F\u4E0E\u5426\u4ECD\u4E0D\u7531\u6B64\u786E\u5B9A\u3002\u8BF7\u91CD\u8BFB\u72B6\u6001\uFF1B\u5982\u9700\u66F4\u65B0\uFF0C\u5FC5\u987B\u91CD\u65B0\u51C6\u5907\u3001\u52FE\u9009\u98CE\u9669\u786E\u8BA4\u5E76\u63D0\u4EA4\u3002",
        "online.title": "\u5728\u7EBF\u66F4\u65B0",
        "online.userOnly": "\u68C0\u67E5\u7248\u672C\u4E0D\u4F1A\u5B89\u88C5\u3002\u53EA\u6709\u51C6\u5907\u540E\u52FE\u9009\u98CE\u9669\u786E\u8BA4\u5E76\u70B9\u51FB\u201C\u786E\u8BA4\u66F4\u65B0\u201D\uFF0C\u624D\u4F1A\u542F\u52A8\u5BBF\u4E3B\u66F4\u65B0\u4EFB\u52A1\u3002\u4E0D\u4F1A\u81EA\u52A8\u66F4\u65B0\u3002",
        "online.continuity": "\u66F4\u65B0\u671F\u95F4\u672C\u9875\u9762\u53EF\u80FD\u6D88\u5931\u6216\u77ED\u6682\u4E0D\u53EF\u7528\uFF1B\u5173\u95ED\u9875\u9762\u4E0D\u4F1A\u53D6\u6D88\u5BBF\u4E3B\u4EFB\u52A1\u3002\u91CD\u65B0\u6253\u5F00\u540E\u53EF\u8BFB\u53D6\u7ED3\u679C\u3002\u9000\u51FA DSH \u4F1A\u4E2D\u65AD\u4EFB\u52A1\uFF0C\u8BF7\u7B49\u5F85\u7ED3\u679C\u540E\u518D\u6309\u63D0\u793A\u91CD\u542F\u3002\u8BF7\u5148\u4FDD\u5B58\u8349\u7A3F\u5E76\u5907\u4EFD\u914D\u7F6E\u3002",
        "online.loading": "\u6B63\u5728\u8BFB\u53D6\u5BBF\u4E3B\u66F4\u65B0\u72B6\u6001\u2026",
        "online.noRecord": "\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u5728\u7EBF\u66F4\u65B0\u4EFB\u52A1\u8BB0\u5F55\uFF1B\u8FD9\u4E0D\u4EE3\u8868\u66F4\u65B0\u6210\u529F\u3002",
        "online.unavailable": "\u5F53\u524D\u65E0\u6CD5\u51C6\u5907\u5728\u7EBF\u66F4\u65B0\u3002",
        "online.recordLost": "\u4EFB\u52A1\u8BB0\u5F55\u5DF2\u4E0D\u53EF\u8BFB\u53D6\uFF0C\u4E0D\u80FD\u786E\u8BA4\u66F4\u65B0\u6210\u529F\u3002\u8BF7\u68C0\u67E5\u63D2\u4EF6\u7BA1\u7406\u72B6\u6001\uFF1B\u4E0D\u8981\u628A\u624B\u52A8\u6307\u5357\u5F53\u4F5C\u66F4\u65B0\u7ED3\u679C\u3002",
        "online.uncertain": "\u786E\u8BA4\u8BF7\u6C42\u7684\u7ED3\u679C\u5C1A\u4E0D\u786E\u5B9A\uFF0C\u4EFB\u52A1\u53EF\u80FD\u5DF2\u542F\u52A8\u3002\u53EA\u91CD\u8BFB\u72B6\u6001\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u786E\u8BA4\uFF1B\u8BF7\u52FF\u91CD\u590D\u66F4\u65B0\u3002",
        "online.requestFailed": "\u8BF7\u6C42\u672A\u5B8C\u6210\uFF0C\u8BF7\u624B\u52A8\u91CD\u8BFB\u72B6\u6001\u3002\u5B89\u5168\u9519\u8BEF\u7801\uFF1A",
        "online.review": "\u786E\u8BA4\u672C\u6B21\u66F4\u65B0",
        "online.badge": "\u6709\u65B0\u7248\u672C",
        "online.availableTitle": "\u53EF\u4EE5\u66F4\u65B0\u5230\u6700\u65B0\u7684\u7A33\u5B9A\u7248",
        "online.availableHint": "\u5148\u5728\u4E0B\u65B9\u51C6\u5907\u66F4\u65B0\uFF0C\u518D\u9605\u8BFB\u98CE\u9669\u3001\u52FE\u9009\u786E\u8BA4\u5E76\u70B9\u51FB\u201C\u786E\u8BA4\u66F4\u65B0\u201D\u3002",
        "online.consentTitle": "\u98CE\u9669\u786E\u8BA4",
        "online.fromVersion": "\u539F\u7248\u672C",
        "online.targetVersion": "\u76EE\u6807\u7248\u672C",
        "online.installedVersion": "\u5DF2\u9A8C\u8BC1\u7684\u5B89\u88C5\u7248\u672C",
        "online.targetSpec": "\u9501\u5B9A\u7684\u76EE\u6807\u6765\u6E90",
        "online.restoreSpec": "\u9501\u5B9A\u7684\u6062\u590D\u6765\u6E90",
        "online.expiresAt": "\u786E\u8BA4\u6709\u6548\u671F\uFF08UTC\uFF09",
        "online.jobId": "\u5BBF\u4E3B\u4EFB\u52A1\u7F16\u53F7",
        "online.errorCode": "\u5B89\u5168\u9519\u8BEF\u7801\uFF1A",
        "online.detailCode": "\u72B6\u6001\u8BF4\u660E\u7801\uFF1A",
        "online.risks": "\u6B64\u64CD\u4F5C\u5F71\u54CD\u5F53\u524D profile \u7684\u6240\u6709\u4F1A\u8BDD\uFF0C\u63D2\u4EF6\u53EF\u80FD\u77ED\u6682\u4E0D\u53EF\u7528\u3002\u901A\u5E38\u5148\u79FB\u9664\u65E7\u63D2\u4EF6\u518D\u5B89\u88C5\uFF0C\u65E0\u70ED\u91CD\u8F7D\u65F6\u4F1A\u76F4\u63A5\u5B89\u88C5\u5E76\u7B49\u5F85\u91CD\u542F\u3002\u79FB\u9664\u5E76\u91CD\u65B0\u6DFB\u52A0\u63D2\u4EF6\u5305\u8FD8\u53EF\u80FD\u6539\u53D8\u7EC4\u5408\u914D\u7F6E\u987A\u5E8F\u548C\u8986\u76D6\u4F18\u5148\u7EA7\uFF0C\u8BF7\u91CD\u65B0\u6838\u5BF9\u6709\u6548\u914D\u7F6E\u3002\u5B89\u88C5\u5931\u8D25\u65F6\u4F1A\u5C1D\u8BD5\u6062\u590D\u65E7\u7248\u672C\uFF0C\u4F46\u6062\u590D\u4E5F\u53EF\u80FD\u5931\u8D25\uFF0C\u5C4A\u65F6\u9700\u624B\u52A8\u4FEE\u590D\u3002\u53EF\u80FD\u9700\u8981\u5B8C\u5168\u9000\u51FA\u5E76\u91CD\u542F DSH\uFF1B\u53EA\u5237\u65B0\u9875\u9762\u4E0D\u8DB3\u4EE5\u91CD\u8F7D Host\u3002",
        "online.consent": "\u6211\u5DF2\u4FDD\u5B58\u9700\u8981\u4FDD\u7559\u7684\u5185\u5BB9\uFF0C\u7406\u89E3\u4EE5\u4E0A\u6240\u6709\u4F1A\u8BDD\u5F71\u54CD\u3001\u4E0D\u53EF\u7528\u3001\u914D\u7F6E\u8986\u76D6\u4F18\u5148\u7EA7\u53D8\u5316\u3001\u6062\u590D\u5931\u8D25\u548C\u91CD\u542F\u98CE\u9669\uFF0C\u5E76\u540C\u610F\u66F4\u65B0\u5230\u4E0A\u8FF0\u76EE\u6807\u7248\u672C\u3002",
        "online.confirm": "\u786E\u8BA4\u66F4\u65B0",
        "online.dismiss": "\u653E\u5F03\u672C\u6B21\u786E\u8BA4",
        "online.prepare": "\u51C6\u5907\u5728\u7EBF\u66F4\u65B0",
        "online.preparing": "\u6B63\u5728\u51C6\u5907\u2026",
        "online.reload": "\u91CD\u8BFB\u5728\u7EBF\u66F4\u65B0\u72B6\u6001",
        "online.submitting": "\u6B63\u5728\u63D0\u4EA4\u786E\u8BA4\u3002\u82E5\u9875\u9762\u5931\u53BB\u8FDE\u63A5\uFF0C\u8BF7\u91CD\u65B0\u6253\u5F00\u8BFB\u53D6\u72B6\u6001\uFF0C\u4E0D\u8981\u91CD\u590D\u63D0\u4EA4\u3002",
        "online.restart": "\u8BF7\u6309\u5BBF\u4E3B\u63D0\u793A\u5B8C\u5168\u9000\u51FA\u5E76\u91CD\u542F DSH\uFF0C\u518D\u6838\u5BF9\u5DF2\u52A0\u8F7D\u7248\u672C\uFF1B\u5F53\u524D\u4E0D\u58F0\u660E\u66F4\u65B0\u5DF2\u751F\u6548\u3002",
        "online.cancelRequested": "\u5BBF\u4E3B\u5DF2\u8BB0\u5F55\u53D6\u6D88\u8BF7\u6C42\uFF1B\u7B49\u5F85\u6700\u7EC8\u7ED3\u679C\uFF0C\u4E0D\u80FD\u89C6\u4E3A\u5DF2\u53D6\u6D88\u3002",
        "online.phase.queued": "\u66F4\u65B0\u5DF2\u6392\u961F\uFF0C\u5BBF\u4E3B\u5C06\u7EE7\u7EED\u6267\u884C\u3002",
        "online.phase.checking": "\u6B63\u5728\u6838\u5BF9\u66F4\u65B0\u6761\u4EF6\u3002",
        "online.phase.removing": "\u6B63\u5728\u79FB\u9664\u65E7\u63D2\u4EF6\u3002",
        "online.phase.installing": "\u6B63\u5728\u5B89\u88C5\u5DF2\u786E\u8BA4\u7684\u76EE\u6807\u7248\u672C\u3002",
        "online.phase.activating": "\u6B63\u5728\u6FC0\u6D3B\u76EE\u6807\u63D2\u4EF6\u3002",
        "online.phase.verifying": "\u6B63\u5728\u9A8C\u8BC1\u5B89\u88C5\u4E0E\u6FC0\u6D3B\u72B6\u6001\u3002",
        "online.phase.recovering": "\u66F4\u65B0\u9047\u5230\u95EE\u9898\uFF0C\u6B63\u5728\u5C1D\u8BD5\u6062\u590D\u539F\u7248\u672C\u3002",
        "online.phase.updated": "\u5BBF\u4E3B\u5DF2\u9A8C\u8BC1\u76EE\u6807\u7248\u672C\u66F4\u65B0\u6210\u529F\u3002",
        "online.phase.restart-required": "\u5B89\u88C5\u5DF2\u5B8C\u6210\uFF0C\u4F46\u9700\u8981\u91CD\u542F\uFF1B\u5F53\u524D\u672A\u786E\u8BA4\u65B0\u7248\u672C\u5DF2\u751F\u6548\u3002",
        "online.phase.restored": "\u76EE\u6807\u66F4\u65B0\u672A\u6210\u529F\uFF1B\u5BBF\u4E3B\u62A5\u544A\u5DF2\u6062\u590D\u539F\u7248\u672C\u3002",
        "online.phase.repair-required": "\u66F4\u65B0\u6216\u6062\u590D\u672A\u5B8C\u6210\uFF0C\u9700\u8981\u624B\u52A8\u4FEE\u590D\u3002\u8BF7\u67E5\u770B\u63D2\u4EF6\u7BA1\u7406\u72B6\u6001\u3002",
        "online.phase.failed": "\u66F4\u65B0\u5931\u8D25\uFF1B\u672A\u786E\u8BA4\u76EE\u6807\u7248\u672C\u5DF2\u5B89\u88C5\u3002",
        "online.phase.cancelled": "\u5BBF\u4E3B\u62A5\u544A\u4EFB\u52A1\u5DF2\u53D6\u6D88\uFF1B\u8BF7\u6838\u5BF9\u5F53\u524D\u63D2\u4EF6\u72B6\u6001\u3002",
        "online.phase.unknown": "\u4EFB\u52A1\u7ED3\u679C\u672A\u77E5\uFF0C\u4E0D\u80FD\u89C6\u4E3A\u66F4\u65B0\u6210\u529F\u3002",
        "updates.title": "\u7248\u672C\u4E0E\u66F4\u65B0",
        "updates.readOnly": "\u7248\u672C\u68C0\u67E5\u53EA\u8BFB\u53D6\u516C\u5F00\u4FE1\u606F\uFF0C\u4E0D\u4E0B\u8F7D\u6216\u5B89\u88C5\u3002\u5728\u7EBF\u66F4\u65B0\u9700\u5728\u4E0B\u65B9\u5355\u72EC\u51C6\u5907\u5E76\u660E\u786E\u786E\u8BA4\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u5347\u7EA7\u3002",
        "updates.installedVersion": "\u5F53\u524D\u8FD0\u884C\u7248\u672C",
        "updates.latestVersion": "\u6700\u65B0\u7A33\u5B9A\u7248",
        "updates.checkedAt": "\u4E0A\u6B21\u68C0\u67E5\u65F6\u95F4\uFF08UTC\uFF09",
        "updates.unknown": "\u672A\u77E5",
        "updates.notChecked": "\u5C1A\u65E0\u8BB0\u5F55",
        "updates.idle": "\u5C1A\u672A\u68C0\u67E5\u66F4\u65B0\uFF0C\u8BF7\u6309\u9700\u70B9\u51FB\u68C0\u67E5\u6309\u94AE\u3002",
        "updates.loading": "\u6B63\u5728\u8BFB\u53D6 Host \u7F13\u5B58\u72B6\u6001\uFF0C\u4E0D\u8BBF\u95EE GitHub\u2026",
        "updates.checking": "\u6B63\u5728\u5411 GitHub \u68C0\u67E5\u516C\u5F00\u7A33\u5B9A\u7248\u4FE1\u606F\u2026",
        "updates.current": "\u5F53\u524D\u8FD0\u884C\u7248\u672C\u4E0E\u4E0A\u6B21\u68C0\u67E5\u5230\u7684\u6700\u65B0\u7A33\u5B9A\u7248\u4E00\u81F4\u3002",
        "updates.update-available": "\u53D1\u73B0\u8F83\u65B0\u7684\u7A33\u5B9A\u7248\uFF0C\u53EF\u51C6\u5907\u5728\u7EBF\u66F4\u65B0\uFF0C\u6216\u9009\u62E9\u4E0B\u65B9\u7684\u624B\u52A8\u5347\u7EA7\u8DEF\u5F84\u3002",
        "updates.availableTitle": "\u53D1\u73B0\u65B0\u7248\u672C",
        "updates.availableHint": "\u53EF\u5728\u4E0B\u65B9\u51C6\u5907\u5728\u7EBF\u66F4\u65B0\uFF1B\u63D0\u4EA4\u524D\u9700\u8981\u9605\u8BFB\u98CE\u9669\u5E76\u52FE\u9009\u786E\u8BA4\u3002",
        "priority.title": "Priority \u4F9B\u5E94\u5546\u6388\u6743\uFF08\u9AD8\u7EA7\uFF09",
        "priority.scope": "Fast \u901A\u8FC7\u8BF7\u6C42\u7EA7 service_tier \u751F\u6548\uFF0C\u5C5E\u4E8E\u63A5\u5165\u70B9\u80FD\u529B\uFF0C\u4E0D\u662F\u6A21\u578B\u540D\u5B57\u7684\u5C5E\u6027\u3002\u9ED8\u8BA4\u4EC5\u6388\u6743 openai\u3001openai-codex\u3001cpa\uFF1B\u4E0B\u9762\u53EA\u80FD\u6388\u6743\u5DF2\u6CE8\u518C\u4E14\u786E\u5B9E\u63D0\u4F9B OpenAI \u7CFB\u5217\u6A21\u578B\u7684\u4F9B\u5E94\u5546\u3002",
        "priority.configured": "\u5185\u7F6E\u6388\u6743",
        "priority.authorized": "\u5DF2\u81EA\u52A9\u6388\u6743",
        "priority.none": "\u5C1A\u672A\u81EA\u52A9\u6388\u6743\u5176\u4ED6\u4F9B\u5E94\u5546\u3002",
        "priority.candidates": "\u53EF\u6388\u6743\u4F9B\u5E94\u5546",
        "priority.choose": "\u8BF7\u9009\u62E9\u4F9B\u5E94\u5546",
        "priority.noCandidates": "\u6CA1\u6709\u5176\u4ED6\u53EF\u6388\u6743\u4F9B\u5E94\u5546\uFF1A\u672A\u6CE8\u518C\uFF0C\u6216\u672A\u63D0\u4F9B OpenAI \u7CFB\u5217\u6A21\u578B\u3002",
        "priority.allAuthorized": "\u5F53\u524D\u6240\u6709\u63D0\u4F9B OpenAI \u7CFB\u5217\u6A21\u578B\u7684\u4F9B\u5E94\u5546\u90FD\u5DF2\u5728\u5185\u7F6E\u6388\u6743\u4E2D\uFF0C\u65E0\u9700\u518D\u6B21\u6388\u6743\u3002\u82E5\u4F60\u8981\u7528\u7684\u662F\u5176\u4ED6\u63A5\u5165\u70B9\uFF0C\u8BF7\u5148\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u914D\u7F6E\u8BE5\u4F9B\u5E94\u5546\uFF0C\u786E\u8BA4\u5B83\u7684\u6A21\u578B\u76EE\u5F55\u91CC\u5B58\u5728 OpenAI \u7CFB\u5217\u6A21\u578B\uFF0C\u518D\u70B9\u51FB\u201C\u91CD\u65B0\u8BFB\u53D6\u6388\u6743\u201D\u3002",
        "priority.noProviderModels": "\u5F53\u524D\u6CA1\u6709\u5DF2\u6CE8\u518C\u4E14\u63D0\u4F9B OpenAI \u7CFB\u5217\u6A21\u578B\u7684\u4F9B\u5E94\u5546\u3002\u8BF7\u5148\u914D\u7F6E\u4F9B\u5E94\u5546\u4E0E\u6A21\u578B\uFF0C\u518D\u56DE\u5230\u8FD9\u91CC\u70B9\u51FB\u201C\u91CD\u65B0\u8BFB\u53D6\u6388\u6743\u201D\u3002",
        "priority.visibleModels": "\u53EF\u8BC6\u522B\u7684 OpenAI \u6A21\u578B",
        "priority.exampleModels": "\u793A\u4F8B\u6A21\u578B",
        "priority.consent": "\u6211\u786E\u8BA4\u8BE5\u63A5\u5165\u70B9\u652F\u6301 Priority\uFF0C\u53EF\u80FD\u4EA7\u751F\u989D\u5916\u8D39\u7528\uFF0C\u5E76\u540C\u610F\u628A\u5B83\u52A0\u5165\u672C profile \u7684 Priority \u5141\u8BB8\u540D\u5355\u3002",
        "priority.authorize": "\u6388\u6743",
        "priority.revoke": "\u64A4\u9500\u6388\u6743",
        "priority.reload": "\u91CD\u65B0\u8BFB\u53D6\u6388\u6743",
        "priority.loading": "\u6B63\u5728\u8BFB\u53D6\u4F9B\u5E94\u5546\u6388\u6743\u2026",
        "priority.stale": "\u5176\u4ED6\u7A97\u53E3\u5DF2\u4FEE\u6539\u6388\u6743\u540D\u5355\u3002\u5DF2\u91CD\u65B0\u8BFB\u53D6\uFF0C\u8BF7\u786E\u8BA4\u540E\u91CD\u8BD5\u3002",
        "priority.refused": "\u8BE5\u4F9B\u5E94\u5546\u4E0D\u80FD\u88AB\u6388\u6743\uFF1A\u672A\u6CE8\u518C\uFF0C\u6216\u6CA1\u6709 OpenAI \u7CFB\u5217\u6A21\u578B\u3002",
        "priority.noConsent": "\u8BF7\u5148\u52FE\u9009\u98CE\u9669\u786E\u8BA4\u3002",
        "priority.saved": "\u6388\u6743\u540D\u5355\u5DF2\u66F4\u65B0\uFF1B\u5F53\u524D\u4F1A\u8BDD\u7684 Fast \u63A7\u4EF6\u4F1A\u5728\u91CD\u65B0\u8BFB\u53D6\u6295\u5F71\u540E\u751F\u6548\u3002",
        "priority.error": "\u6388\u6743\u64CD\u4F5C\u672A\u5B8C\u6210\uFF0C\u672A\u786E\u8BA4\u4EFB\u4F55\u6539\u52A8\u3002\u8BF7\u91CD\u65B0\u8BFB\u53D6\u540E\u91CD\u8BD5\u3002",
        "priority.unknownProvider": "\u4F9B\u5E94\u5546\u4E0D\u5B58\u5728\u6216\u672A\u6CE8\u518C",
        "updates.ahead": "\u5F53\u524D\u8FD0\u884C\u7248\u672C\u9886\u5148\u4E8E\u6700\u65B0\u7A33\u5B9A\u7248\uFF0C\u53EF\u80FD\u662F\u5F00\u53D1\u6216\u5019\u9009\u6784\u5EFA\uFF1B\u5F53\u524D\u4E0D\u63D0\u793A\u7A33\u5B9A\u7248\u5347\u7EA7\u3002",
        "updates.error": "\u66F4\u65B0\u68C0\u67E5\u672A\u5B8C\u6210\uFF0C\u4E0D\u80FD\u786E\u8BA4\u662F\u5426\u5DF2\u662F\u6700\u65B0\u7248\u672C\u3002",
        "updates.cancelled": "\u672C\u6B21\u8BFB\u53D6\u6216\u68C0\u67E5\u5DF2\u53D6\u6D88\uFF0C\u6CA1\u6709\u4E0B\u8F7D\u6216\u5B89\u88C5\u4EFB\u4F55\u5185\u5BB9\u3002",
        "updates.error.network": "\u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u624B\u52A8\u91CD\u8BD5\u3002",
        "updates.error.timeout": "\u68C0\u67E5\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u624B\u52A8\u91CD\u8BD5\u3002",
        "updates.error.rate-limited": "GitHub \u6682\u65F6\u9650\u5236\u8BF7\u6C42\uFF0C\u8BF7\u7A0D\u540E\u624B\u52A8\u91CD\u8BD5\u3002",
        "updates.error.not-found": "\u672A\u627E\u5230\u516C\u5F00\u7A33\u5B9A\u7248\uFF0C\u8BF7\u6838\u5BF9\u53D1\u5E03\u72B6\u6001\u540E\u91CD\u8BD5\u3002",
        "updates.error.invalid-response": "\u7248\u672C\u54CD\u5E94\u65E0\u6548\uFF0C\u672A\u5C06\u5B83\u4F5C\u4E3A\u6709\u6548\u66F4\u65B0\u7ED3\u679C\u3002",
        "updates.checkButton": "\u68C0\u67E5\u66F4\u65B0",
        "updates.checkingButton": "\u6B63\u5728\u68C0\u67E5\u2026",
        "updates.cancel": "\u53D6\u6D88",
        "updates.reloadStatus": "\u91CD\u8BFB\u672C\u5730\u72B6\u6001",
        "updates.releaseLink": "\u5728 GitHub \u67E5\u770B\u7248\u672C",
        "updates.privacy": "\u70B9\u51FB\u201C\u68C0\u67E5\u66F4\u65B0\u201D\u4F1A\u8BFB\u53D6 GitHub \u7684\u516C\u5F00\u7248\u672C\u4FE1\u606F\uFF1B\u51C6\u5907\u5728\u7EBF\u66F4\u65B0\u4E5F\u4F1A\u6838\u5BF9\u76EE\u6807\u548C\u6062\u590D\u6765\u6E90\u3002\u4E0D\u4F1A\u53D1\u9001\u4F1A\u8BDD\u3001\u8349\u7A3F\u6216\u6587\u4EF6\u5185\u5BB9\u3002",
        "updates.cacheNote": "\u4E3A\u9075\u5B88 GitHub \u8BF7\u6C42\u9650\u5236\uFF0C\u77ED\u65F6\u95F4\u5185\u91CD\u590D\u68C0\u67E5\u53EF\u80FD\u590D\u7528 Host \u7F13\u5B58\uFF1B\u4E0D\u4F1A\u5B9A\u65F6\u81EA\u52A8\u68C0\u67E5\u3002",
        "updates.installAddress": "\u65E0 tag \u5B89\u88C5\u5730\u5740",
        "updates.copy": "\u590D\u5236\u5730\u5740",
        "updates.copied": "\u5730\u5740\u5DF2\u590D\u5236",
        "updates.copyFailed": "\u65E0\u6CD5\u81EA\u52A8\u590D\u5236\uFF0C\u8BF7\u624B\u52A8\u9009\u62E9\u5E76\u590D\u5236\u4E0A\u65B9\u5730\u5740\u3002",
        "updates.manualUpgrade": "\u53EF\u9009\uFF1A\u624B\u52A8\u5347\u7EA7\u6307\u5357",
        "updates.stepSave": "\u5148\u4FDD\u5B58\u8349\u7A3F\u548C\u4E24\u9879\u529F\u80FD\u8BBE\u7F6E\uFF0C\u8BB0\u5F55\u9700\u8981\u4FDD\u7559\u7684\u914D\u7F6E\u3002",
        "updates.stepRemove": "\u8FDB\u5165 DSH \u63D2\u4EF6\u7BA1\u7406\uFF0C\u79FB\u9664\u65E7\u63D2\u4EF6\u4F9D\u8D56\uFF08\u6309\u5305\u540D\uFF09\uFF1A",
        "updates.stepInstall": "\u4F7F\u7528\u4EE5\u4E0B\u65E0 tag \u5B89\u88C5\u5730\u5740\u91CD\u65B0\u6DFB\u52A0\u63D2\u4EF6\uFF1A",
        "updates.stepRestart": "\u6309\u5B89\u88C5\u7ED3\u679C\u63D0\u793A\u64CD\u4F5C\uFF1B\u5982\u679C\u9700\u8981\u6216\u4ECD\u52A0\u8F7D\u65E7\u6A21\u5757\uFF0C\u8BF7\u5B8C\u5168\u9000\u51FA\u5E76\u91CD\u542F DSH\uFF0C\u4EC5\u5237\u65B0\u6D4F\u89C8\u5668\u4E0D\u8DB3\u4EE5\u91CD\u8F7D Host\u3002",
        "updates.backup": "\u6B64\u68C0\u67E5\u5668\u4E0D\u4F1A\u4FEE\u6539\u670D\u52A1\u5546/source \u6570\u636E\u3002\u624B\u52A8\u5347\u7EA7\u524D\u4ECD\u5EFA\u8BAE\u5E38\u89C4\u5907\u4EFD DSH \u914D\u7F6E\u548C\u4F1A\u8BDD\u6570\u636E\u3002",
        noSuggestion: "\u6682\u65E0\u4E0B\u4E00\u95EE\u5EFA\u8BAE\u3002\u4F60\u53EF\u4EE5\u76F4\u63A5\u8F93\u5165\u65B0\u7684\u95EE\u9898\u3002",
        secondsUnit: "\u79D2",
        streamingShort: "\u751F\u6210\u4E2D",
        showOriginal: "\u67E5\u770B\u539F\u6587",
        generationDetails: "\u751F\u6210\u8BE6\u60C5",
        firstTokenLabel: "\u9996\u5B57",
        totalTimeLabel: "\u603B\u8017\u65F6",
        warningsLabel: "\u5904\u7406\u63D0\u793A",
        chooseSession: "\u5168\u5C40\u5F00\u5173\u53EF\u76F4\u63A5\u8C03\u6574\u3002\u8981\u7F16\u8F91\u4F1A\u8BDD\u53C2\u6570\uFF0C\u8BF7\u5148\u6253\u5F00\u76EE\u6807\u4F1A\u8BDD\uFF0C\u518D\u8FDB\u5165\u6B64\u9875\u3002",
        returnConversation: "\u8FD4\u56DE\u5BF9\u8BDD",
        sessionScope: "\u4E0B\u9762\u7684\u6A21\u578B\u3001\u63A8\u7406\u6863\u3001\u8F85\u52A9 Fast \u548C\u8F6E\u6570\u4EC5\u5E94\u7528\u4E8E\u6240\u793A\u4F1A\u8BDD\uFF1B\u4E0D\u5305\u542B\u5168\u5C40\u5F00\u5173\u3002\u5207\u6362\u914D\u7F6E\u5BF9\u8C61\u65F6\uFF0C\u8BF7\u5148\u6253\u5F00\u53E6\u4E00\u4F1A\u8BDD\uFF0C\u518D\u8FDB\u5165\u6B64\u9875\u3002",
        editingSession: "\u6B63\u5728\u914D\u7F6E\u7684\u4F1A\u8BDD",
        loading: "\u6B63\u5728\u52A0\u8F7D\u8BBE\u7F6E\u2026",
        generatingSuggest: "\u6B63\u5728\u5EFA\u8BAE\u2026",
        enableSuggest: "\u8BF7\u5148\u5728\u63D0\u793A\u8BCD\u8F85\u52A9\u4E2D\u5F00\u542F\u5F53\u524D profile \u7684\u5168\u5C40\u4E0B\u4E00\u95EE\u5EFA\u8BAE\u5F00\u5173\u3002",
        suggestReset: "\u8F93\u5165\u6216\u914D\u7F6E\u53D1\u751F\u53D8\u5316\uFF0C\u672C\u8F6E\u81EA\u52A8\u5EFA\u8BAE\u5DF2\u53D6\u6D88\uFF1B\u53EF\u624B\u52A8\u91CD\u65B0\u751F\u6210\u3002",
        suggestRequested: "\u672C\u8F6E\u5DF2\u89E6\u53D1\u8FC7\u5EFA\u8BAE\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u590D\u8BF7\u6C42\uFF1B\u9700\u8981\u65F6\u53EF\u624B\u52A8\u91CD\u8BD5\u3002",
        streaming: "\u6B63\u5728\u6D41\u5F0F\u751F\u6210\uFF0C\u5B8C\u6210\u540E\u53EF\u5E94\u7528",
        generateSuggest: "\u751F\u6210\u4E0B\u4E00\u95EE\u5EFA\u8BAE",
        suggestDisabled: "\u81EA\u52A8\u5EFA\u8BAE\u5C1A\u672A\u542F\u7528\u3002",
        draftOccupied: "\u8349\u7A3F\u542B\u6587\u5B57\u3001\u5F15\u7528\u6216\u9644\u4EF6\uFF0C\u81EA\u52A8\u5EFA\u8BAE\u5DF2\u8DF3\u8FC7\uFF0C\u4E0D\u4F1A\u8986\u76D6\u8F93\u5165\u3002",
        waitingQA: "\u81EA\u52A8\u7B49\u5F85\u4E0B\u4E00\u8F6E\u5B8C\u6574 QA\uFF1B\u4E5F\u53EF\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\uFF0C\u57FA\u4E8E\u5DF2\u6709 QA \u751F\u6210\u3002",
        enhancing: "\u6B63\u5728\u589E\u5F3A\u2026",
        enableEnhance: "\u8BF7\u5148\u5F00\u542F\u5F53\u524D profile \u7684\u5168\u5C40\u589E\u5F3A\u5F00\u5173\uFF1B\u4F1A\u8BDD\u6A21\u578B\u7B49\u53C2\u6570\u5728\u4E0B\u65B9\u5355\u72EC\u4FDD\u5B58\u3002",
        transportError: "\u8F85\u52A9\u670D\u52A1\u8FDE\u63A5\u5931\u8D25\uFF08\u4F20\u8F93\u5C42\uFF09\uFF0C\u4E0D\u662F\u6A21\u578B\u914D\u7F6E\u9519\u8BEF\u3002\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5\u3002",
        authError: "\u8F85\u52A9\u670D\u52A1\u8BBF\u95EE\u88AB\u62D2\u7EDD\uFF0C\u8BF7\u68C0\u67E5\u5F53\u524D\u8FDE\u63A5\u4E0E\u4F1A\u8BDD\u6743\u9650\u3002",
        parallel: "\u4E24\u9879\u72EC\u7ACB\uFF0C\u53EF\u540C\u65F6\u542F\u7528\uFF1B\u4E0D\u662F\u4E8C\u9009\u4E00\u7684\u6A21\u5F0F\u3002",
        suggestContext: "\u6839\u636E\u6700\u8FD1 N \u8F6E\u5B8C\u6574\u95EE\u7B54\u7EC4\u6210\u7684\u4E0A\u4E0B\u6587\u751F\u6210\u4E0B\u4E00\u95EE\uFF1B\u65B0\u7684\u5B8C\u6574\u95EE\u7B54\u7ED3\u675F\u3001\u4F1A\u8BDD\u7A7A\u95F2\u4E14\u8349\u7A3F\u4E3A\u7A7A\u65F6\u81EA\u52A8\u8BF7\u6C42\u3002",
        enhanceOriginal: "\u4EE5\u4E3B\u8F93\u5165\u6846\u7684\u539F\u6587\u4E3A\u57FA\u7840\u4F18\u5316\u8868\u8FBE\uFF0C\u6700\u8FD1 N \u8F6E\u5B8C\u6574\u95EE\u7B54\u4EC5\u4F5C\u80CC\u666F\uFF1B\u9884\u89C8\u4E0D\u4F1A\u4FEE\u6539\u539F\u6587\u3002",
        title: "\u63D0\u793A\u8BCD\u8F85\u52A9",
        settings: "\u914D\u7F6E",
        close: "\u6536\u8D77",
        suggest: "\u4E0B\u4E00\u95EE\u5EFA\u8BAE",
        enhance: "\u589E\u5F3A\u63D0\u793A\u8BCD",
        enabled: "\u542F\u7528\u6B64\u529F\u80FD",
        follow: "\u8DDF\u968F\u4F1A\u8BDD\u6A21\u578B\u4E0E\u63A8\u7406\u6863",
        followHint: "\u4EC5\u8DDF\u968F\u6A21\u578B\u4E0E\u63A8\u7406\u6863\uFF1B\u8F85\u52A9 Fast \u72EC\u7ACB\u8BBE\u7F6E\uFF0C\u4E0D\u4FEE\u6539\u4E3B\u4F1A\u8BDD\u3002",
        provider: "\u670D\u52A1\u5546",
        model: "\u6A21\u578B",
        effort: "\u63A8\u7406\u6863",
        nativeDefault: "\u6A21\u578B\u9ED8\u8BA4",
        fast: "\u8F85\u52A9 Fast\uFF08\u72EC\u7ACB\uFF0C\u53EF\u80FD\u989D\u5916\u8BA1\u8D39\uFF09",
        rounds: "\u5B8C\u6574\u95EE\u7B54\u8F6E\u6570",
        custom: "\u81EA\u5B9A\u4E49",
        save: "\u4FDD\u5B58\u914D\u7F6E",
        saving: "\u6B63\u5728\u4FDD\u5B58\u2026",
        saved: "\u914D\u7F6E\u5DF2\u4FDD\u5B58",
        selectProvider: "\u9009\u62E9\u670D\u52A1\u5546",
        selectModel: "\u9009\u62E9\u6A21\u578B",
        generate: "\u9884\u89C8\u589E\u5F3A\u7ED3\u679C",
        generating: "\u6B63\u5728\u751F\u6210\u9884\u89C8\u2026",
        cancel: "\u53D6\u6D88",
        preview: "\u72EC\u7ACB\u9884\u89C8\uFF0C\u975E\u539F\u751F Ghost",
        before: "\u539F\u6587",
        after: "\u5EFA\u8BAE\u6587\u672C",
        accept: "\u91C7\u7528\u5EFA\u8BAE",
        apply: "\u5E94\u7528\u5230\u8349\u7A3F",
        copy: "\u590D\u5236",
        copied: "\u5DF2\u590D\u5236",
        undo: "\u64A4\u9500\u672C\u6B21\u5E94\u7528",
        dismiss: "\u5FFD\u7565",
        unsupported: "\u5F53\u524D\u7248\u672C\u4E0D\u652F\u6301\u539F\u751F Ghost \u6216 \u2192 \u91C7\u7EB3\uFF1B\u8BF7\u70B9\u51FB\u91C7\u7528\u3002\u672C\u529F\u80FD\u672A\u6CE8\u518C Ctrl+Alt+E \u5FEB\u6377\u952E\u3002",
        structured: "\u542B\u5F15\u7528\u6216\u547D\u4EE4\u7684\u8349\u7A3F\u4EC5\u652F\u6301\u9884\u89C8/\u590D\u5236\uFF1B\u7ED3\u6784\u5316\u5E94\u7528\u5C1A\u4E0D\u652F\u6301\uFF0C\u4E0D\u4F1A\u66FF\u6362\u5F15\u7528\u6216\u9644\u4EF6\u3002",
        initial: "\u5168\u5C40\u5F00\u5173\u9996\u6B21\u9ED8\u8BA4\u5173\u95ED\uFF1B\u4F1A\u8BDD\u53C2\u6570\u5355\u72EC\u4FDD\u5B58\u3002\u5EFA\u8BAE\u4EC5\u5728\u65B0\u7684\u5B8C\u6574\u95EE\u7B54\u7ED3\u675F\u540E\u751F\u6210\uFF0C\u9996\u6B21\u6253\u5F00\u3001\u542F\u7528\u6216\u91CD\u8FDE\u5747\u4E0D\u8FFD\u6EAF\u3002",
        manual: "\u589E\u5F3A\u53EA\u5728\u70B9\u51FB\u540E\u8BF7\u6C42\uFF1B\u751F\u6210\u671F\u95F4\u4ECD\u53EF\u7F16\u8F91\uFF0C\u7F16\u8F91\u4F1A\u53D6\u6D88\u8FC7\u671F\u7ED3\u679C\u3002",
        busy: "\u4F1A\u8BDD\u4ECD\u5728\u8FD0\u884C\uFF0C\u7ED3\u675F\u540E\u518D\u8BD5\u3002",
        requestError: "\u8BF7\u6C42\u672A\u5B8C\u6210\uFF0C\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\uFF1B\u8BF7\u68C0\u67E5\u914D\u7F6E\u540E\u91CD\u8BD5\u3002",
        fastSkipped: "\u5F53\u524D\u6A21\u578B\u4E0D\u652F\u6301\u8F85\u52A9 Fast\uFF0C\u672C\u6B21\u6309\u666E\u901A\u8BF7\u6C42\u6267\u884C\uFF0C\u672A\u542F\u7528 Priority\uFF1B\u5DF2\u4FDD\u5B58\u7684 Fast \u8BBE\u7F6E\u4FDD\u6301\u4E0D\u53D8\u3002",
        emptyResult: "\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u53EF\u7528\u6587\u672C\uFF0C\u672A\u5E94\u7528\u7ED3\u679C\uFF1B\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002\u53EF\u91CD\u8BD5\uFF0C\u6216\u964D\u4F4E\u63A8\u7406\u6863\u540E\u91CD\u8BD5\u3002",
        cancelled: "\u672C\u6B21\u751F\u6210\u5DF2\u53D6\u6D88\uFF0C\u672A\u5E94\u7528\u7ED3\u679C\uFF1B\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002",
        modelFailed: "\u6A21\u578B\u8BF7\u6C42\u5931\u8D25\uFF08\u4F9B\u5E94\u5546\u6216\u7F51\u7EDC\u539F\u56E0\uFF09\uFF0C\u672A\u5E94\u7528\u7ED3\u679C\uFF1B\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\uFF0C\u6216\u68C0\u67E5\u8BE5\u670D\u52A1\u5546\u914D\u7F6E\u3002",
        safeCodeLabel: "\u5B89\u5168\u9519\u8BEF\u7801",
        configError: "\u6A21\u578B\u3001\u63A8\u7406\u6863\u6216\u914D\u7F6E\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u540E\u4FDD\u5B58\u3002",
        contextError: "\u9009\u5B9A\u5B8C\u6574\u95EE\u7B54\u4E0D\u53EF\u7528\u6216\u8D85\u51FA\u4E0A\u4E0B\u6587\u9650\u5236\uFF0C\u8BF7\u51CF\u5C11\u8F6E\u6570\u3002",
        fileError: "\u6587\u4EF6\u672A\u8BFB\u53D6\uFF1A\u53EF\u80FD\u8D85\u9650\u3001\u654F\u611F\u6216\u4E0D\u652F\u6301\u3002\u8BF7\u53D6\u6D88\u8BE5\u6587\u4EF6\u540E\u91CD\u8BD5\u3002",
        stale: "\u8349\u7A3F\u5DF2\u53D8\u5316\uFF0C\u672A\u5E94\u7528\u7ED3\u679C\u3002\u8BF7\u91CD\u65B0\u751F\u6210\u3002",
        roundsError: "\u81EA\u5B9A\u4E49\u8F6E\u6570\u5FC5\u987B\u4E3A 1\u201320 \u7684\u6574\u6570\u3002",
        modelError: "\u8BF7\u9009\u62E9\u670D\u52A1\u5546\u548C\u6A21\u578B\u3002",
        references: "\u5F53\u524D\u8349\u7A3F\u5F15\u7528",
        readFile: "\u5C06\u6B64\u6587\u4EF6\u7528\u4E8E\u672C\u6B21\u589E\u5F3A",
        unread: "\u672A\u8BFB\u53D6\u5185\u5BB9",
        namesOnly: "\u4EC5\u4FDD\u7559\u53EF\u89C1\u5F15\u7528\u540D",
        fileLimits: "\u4EC5\u52FE\u9009\u6587\u4EF6\u4F1A\u8BFB\u53D6\u5185\u5BB9\uFF1B\u6BCF\u4E2A \u226464 KiB\uFF0C\u5408\u8BA1 \u2264128 KiB\u3002\u6587\u4EF6\u5939\u3001\u4F1A\u8BDD\u5F15\u7528\u53CA\u4E0A\u4F20\u9644\u4EF6\u4E0D\u8BFB\u53D6\u3002",
        attachments: "\u6709 {{count}} \u4E2A\u9644\u4EF6\uFF1B\u5185\u5BB9\u4E0D\u8BFB\u53D6\uFF0C\u5E94\u7528\u4E0D\u4F1A\u6539\u52A8\u9644\u4EF6\u3002",
        effortInvalid: "\u5F53\u524D\u6A21\u578B\u4E0D\u652F\u6301\u65E2\u6709\u63A8\u7406\u6863\uFF0C\u8BF7\u4E3B\u52A8\u91CD\u9009\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u964D\u6863\u3002",
        fastUnsupported: "\u6B64\u6A21\u578B\u4E0D\u652F\u6301\u8F85\u52A9 Fast\uFF1B\u5982\u5DF2\u5F00\u542F\uFF0C\u8BF7\u53D6\u6D88\u52FE\u9009\u540E\u4FDD\u5B58\u3002",
        route: "\u5B9E\u9645\u8DEF\u7531",
        timing: "\u9996\u5B57 {{ttft}} ms \xB7 \u603B\u8017\u65F6 {{total}} ms",
        filesRead: "\u5DF2\u8BFB\u53D6\u6587\u4EF6",
        warnings: "\u6709 {{count}} \u6761\u5904\u7406\u63D0\u793A",
        empty: "\u5728\u4E3B\u8F93\u5165\u6846\u5199\u4E0B\u63D0\u793A\u8BCD\uFF0C\u518D\u70B9\u51FB\u9884\u89C8\u3002",
        access: "\u5F53\u524D\u4F1A\u8BDD\u53EA\u8BFB\uFF0C\u4E0D\u80FD\u8BF7\u6C42\u6216\u5E94\u7528\u3002",
        load: "\u52A0\u8F7D\u8F85\u52A9\u914D\u7F6E\u2026",
        settingsChanged: "\u6709\u672A\u4FDD\u5B58\u914D\u7F6E\uFF1B\u4FDD\u5B58\u540E\u518D\u8BF7\u6C42\u3002",
        budgetPolicy: "\u8F93\u5165\u4E0A\u4E0B\u6587\u548C\u8F93\u51FA\u9884\u7B97\u8DDF\u968F\u6240\u9009\u4F9B\u5E94\u5546\u6A21\u578B\u8BBE\u7F6E\uFF1B\u672A\u914D\u7F6E\u8F93\u51FA\u9884\u7B97\u65F6\u6CBF\u7528\u5BBF\u4E3B/\u4F9B\u5E94\u5546\u9ED8\u8BA4\u884C\u4E3A\u3002\u8F83\u5927\u9884\u7B97\u53EF\u80FD\u589E\u52A0\u8017\u65F6\u548C\u8D39\u7528\uFF1B\u7B49\u5F85\u4E0A\u9650\u4E3A 120 \u79D2\uFF0C\u6587\u4EF6\u8BFB\u53D6\u5B89\u5168\u9650\u5236\u72EC\u7ACB\u4FDD\u7559\u3002\u4E0D\u6539\u53D8\u4E3B\u4F1A\u8BDD\u53C2\u6570\u3002",
        contextUnknown: "\u65E0\u6CD5\u8BFB\u53D6\u6A21\u578B\u4E0A\u4E0B\u6587\u7A97\u53E3\u6216\u5BBF\u4E3B token \u8BA1\u91CF\u670D\u52A1\uFF0C\u672A\u53D1\u8D77\u751F\u6210\u8BF7\u6C42\u3002\u8BF7\u68C0\u67E5\u4F9B\u5E94\u5546\u6A21\u578B\u914D\u7F6E\u4E0E\u5BBF\u4E3B\u517C\u5BB9\u6027\u3002",
        requestTimeout: "\u8F85\u52A9\u8BF7\u6C42\u8FBE\u5230\u7B49\u5F85\u4E0A\u9650\uFF0C\u672A\u5E94\u7528\u7ED3\u679C\uFF1B\u539F\u6587\u4FDD\u6301\u4E0D\u53D8\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8BD5\u3002\u8BF7\u68C0\u67E5\u6A21\u578B\u54CD\u5E94\u901F\u5EA6\u6216\u63A8\u7406\u8BBE\u7F6E\u3002",
        budget: "\u672C\u6B21\u8BF7\u6C42\u8F93\u51FA\u9884\u7B97 {{tokens}} token\uFF0C\u6700\u957F\u7B49\u5F85 {{seconds}} \u79D2\uFF1B\u63A8\u7406\u53EF\u80FD\u5360\u7528\u8F93\u51FA\u9884\u7B97\uFF0C\u4E0D\u81EA\u52A8\u91CD\u8BD5\u6216\u8C03\u6863\u3002",
        outputLimit: "\u6A21\u578B\u5DF2\u8FBE\u5230\u672C\u6B21\u8F93\u51FA\u9884\u7B97\uFF0C\u7ED3\u679C\u672A\u5E94\u7528\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8BD5\u6216\u8C03\u6574\u63A8\u7406\u6863\u3002",
        cached: "\u547D\u4E2D\u672C\u4F1A\u8BDD\u7F13\u5B58\uFF0C\u4E0B\u5217\u8017\u65F6\u4E3A\u539F\u751F\u6210\u8017\u65F6\u3002"
      },
      en: {
        "global.title": "Profile-wide feature switches",
        "global.scope": "These two switches save immediately for every existing and new session in this profile. No selected session is required. Models, reasoning effort, auxiliary Fast and Q&A rounds remain session-specific.",
        "global.charge": "Enabling next-question suggestions can automatically call a model and incur charges after a new complete Q&A when a session is idle with an empty draft. Enhancement still requires a click. Turning a feature off invalidates its pending results.",
        "global.suggest": "Enable suggestions across this profile",
        "global.enhance": "Enable enhancement across this profile",
        "global.migration": "Profile-wide switches start off. Old per-session enablement is not migrated automatically. Enable each feature here once for both existing and new sessions. Enabling or reconnecting never replays historical Q&A.",
        "global.loading": "Reading global switches and connecting live updates\u2026",
        "global.disconnected": "Global sync is unavailable. The last confirmed values may remain visible, but auxiliary requests are temporarily disabled in sessions. Reconnection only reads status; it never resends a save.",
        "global.saving": "Saving profile-wide switches\u2026",
        "global.saved": "The Host confirmed that the profile-wide switch was saved.",
        "global.saveFailed": "The save was not confirmed. Do not assume the switch changed. Reload status before retrying manually; saves are never retried automatically.",
        "global.stale": "Another window changed the switches. This older operation is not reported as the current successful save. Reload and review before acting; no save is resent automatically.",
        "global.reload": "Reload profile-wide switches",
        "online.confirmationRejected": "The Host explicitly rejected this confirmation without starting an update job for it. Reload status, then prepare and confirm again. Nothing retries automatically. Error code:",
        "online.forgetWarning": "If the record cannot be recovered, first verify the installed version in plugin management and make sure no update job is still running. Clearing only removes this tab\u2019s local tracking marker. It does not mean success, and does not cancel, start, or retry any Host job. Reload status successfully with no active job before clearing.",
        "online.forgetAcknowledgement": "I have manually verified the installation and that no update job is still running. I understand that clearing the marker is not an update result.",
        "online.forgetMarker": "Clear local tracking marker only",
        "online.markerCleared": "The local tracking marker was cleared. No Host job was changed, and this does not establish success. Reload status; any update still requires fresh preparation, risk consent, and confirmation.",
        "online.title": "Online update",
        "online.userOnly": "Checking versions never installs anything. Only preparing, checking the risk confirmation, and clicking Confirm update starts a Host update job. Updates are never automatic.",
        "online.continuity": "This page may disappear or become temporarily unavailable during the update. Closing it does not cancel the Host job. Reopen it to read the result. Quitting DSH interrupts the job; wait for its outcome before restarting as instructed. Save drafts and back up configuration first.",
        "online.loading": "Reading Host update status\u2026",
        "online.noRecord": "No online update job record is available. This does not mean an update succeeded.",
        "online.unavailable": "Online update preparation is currently unavailable.",
        "online.recordLost": "The job record is no longer available. Success cannot be confirmed. Check plugin management; the manual guide is not an update result.",
        "online.uncertain": "The confirmation outcome is uncertain; the job may have started. Reload status only. Confirmation will not be resent automatically. Do not start a duplicate update.",
        "online.requestFailed": "The request did not complete. Reload status manually. Safe error code:",
        "online.review": "Review this update",
        "online.badge": "Update available",
        "online.availableTitle": "A newer stable version can be installed",
        "online.availableHint": "Prepare the update below, review the risks, tick consent, then choose Confirm update.",
        "online.consentTitle": "Risk confirmation",
        "online.fromVersion": "Original version",
        "online.targetVersion": "Target version",
        "online.installedVersion": "Verified installed version",
        "online.targetSpec": "Pinned target source",
        "online.restoreSpec": "Pinned recovery source",
        "online.expiresAt": "Confirmation expiry (UTC)",
        "online.jobId": "Host job ID",
        "online.errorCode": "Safe error code:",
        "online.detailCode": "Status detail code:",
        "online.risks": "This affects every session in the current profile. The plugin may become temporarily unavailable. The old plugin is normally removed before installation, while hosts without hot reload install in place and require restart. Removing and re-adding the bundle may change its configuration order and override precedence; recheck effective settings. If installation fails, recovery of the original version will be attempted; recovery can also fail and require manual repair. You may need to fully quit and restart DSH. A browser refresh alone does not reload the Host.",
        "online.consent": "I have saved what I need and understand the impact on all sessions, unavailability, configuration precedence changes, failed recovery and restart risks. I consent to updating to the target version above.",
        "online.confirm": "Confirm update",
        "online.dismiss": "Discard confirmation",
        "online.prepare": "Prepare online update",
        "online.preparing": "Preparing\u2026",
        "online.reload": "Reload online update status",
        "online.submitting": "Submitting confirmation. If this page disconnects, reopen it to read status; do not submit again.",
        "online.restart": "Fully quit and restart DSH as instructed by the Host, then verify the loaded version. The update is not yet confirmed active.",
        "online.cancelRequested": "The Host recorded a cancellation request. Wait for the final outcome; cancellation is not yet confirmed.",
        "online.phase.queued": "Update queued. The Host will continue the job.",
        "online.phase.checking": "Checking update conditions.",
        "online.phase.removing": "Removing the old plugin.",
        "online.phase.installing": "Installing the confirmed target version.",
        "online.phase.activating": "Activating the target plugin.",
        "online.phase.verifying": "Verifying installation and activation.",
        "online.phase.recovering": "The update encountered a problem. Attempting to restore the original version.",
        "online.phase.updated": "The Host verified that the target version was updated successfully.",
        "online.phase.restart-required": "Installation finished, but a restart is required. The new version is not yet confirmed active.",
        "online.phase.restored": "The target update did not succeed. The Host reports the original version was restored.",
        "online.phase.repair-required": "Update or recovery is incomplete. Manual repair is required; check plugin management.",
        "online.phase.failed": "Update failed. Target installation is not confirmed.",
        "online.phase.cancelled": "The Host reports cancellation. Verify the current plugin state.",
        "online.phase.unknown": "The job outcome is unknown, not a successful update.",
        "updates.title": "Version and updates",
        "updates.readOnly": "Version checks only read public information; they never download or install. Online updates require separate preparation and explicit confirmation below. Nothing upgrades automatically.",
        "updates.installedVersion": "Running version",
        "updates.latestVersion": "Latest stable release",
        "updates.checkedAt": "Last check (UTC)",
        "updates.unknown": "Unknown",
        "updates.notChecked": "Not recorded",
        "updates.idle": "Updates have not been checked. Use the button when needed.",
        "updates.loading": "Reading the Host cache without contacting GitHub\u2026",
        "updates.checking": "Checking public stable-release information on GitHub\u2026",
        "updates.current": "The running version matches the latest stable release from the last check.",
        "updates.update-available": "A newer stable release is available. Prepare an online update or use the optional manual upgrade path below.",
        "updates.availableTitle": "New version available",
        "updates.availableHint": "Prepare the online update below; review the risks and tick consent before submitting.",
        "priority.title": "Priority provider authorization (advanced)",
        "priority.scope": "Fast works through the request-level service_tier, which is an endpoint capability rather than a property of the model name. Only openai, openai-codex and cpa are authorized by default; this section can authorize another provider only when it is registered and actually offers OpenAI-family models.",
        "priority.configured": "Configured by the package",
        "priority.authorized": "Authorized here",
        "priority.none": "No additional provider is authorized yet.",
        "priority.candidates": "Providers that may be authorized",
        "priority.choose": "Choose a provider",
        "priority.noCandidates": "No other provider can be authorized: it is not registered or offers no OpenAI-family model.",
        "priority.allAuthorized": "Every provider that offers OpenAI-family models is already authorized by the package, so there is nothing to add. To use another endpoint, configure that provider and make sure its model catalog lists OpenAI-family models, then choose Reload authorization.",
        "priority.noProviderModels": "No registered provider currently offers an OpenAI-family model. Configure a provider and model first, then choose Reload authorization here.",
        "priority.visibleModels": "Recognized OpenAI models",
        "priority.exampleModels": "Example models",
        "priority.consent": "I confirm this endpoint supports Priority, that extra charges may apply, and that it joins this profile's Priority allowlist.",
        "priority.authorize": "Authorize",
        "priority.revoke": "Revoke",
        "priority.reload": "Reload authorization",
        "priority.loading": "Reading provider authorization\u2026",
        "priority.stale": "Another window changed the allowlist. It was reloaded; review it and try again.",
        "priority.refused": "This provider cannot be authorized: it is not registered or offers no OpenAI-family model.",
        "priority.noConsent": "Tick the risk confirmation first.",
        "priority.saved": "The allowlist changed. The Fast control in this session updates after projections are read again.",
        "priority.error": "The authorization request did not complete and no change is confirmed. Reload and try again.",
        "priority.unknownProvider": "The provider does not exist or is not registered",
        "updates.ahead": "The running version is ahead of the latest stable release and may be a development or candidate build. No stable upgrade is offered.",
        "updates.error": "The update check did not complete. The latest version is not confirmed.",
        "updates.cancelled": "This read or check was cancelled. Nothing was downloaded or installed.",
        "updates.error.network": "The network connection failed. Retry manually later.",
        "updates.error.timeout": "The check timed out. Retry manually later.",
        "updates.error.rate-limited": "GitHub temporarily limited requests. Retry manually later.",
        "updates.error.not-found": "No public stable release was found. Check the release status and retry.",
        "updates.error.invalid-response": "The version response was invalid and was not accepted as an update result.",
        "updates.checkButton": "Check for updates",
        "updates.checkingButton": "Checking\u2026",
        "updates.cancel": "Cancel",
        "updates.reloadStatus": "Reload local status",
        "updates.releaseLink": "View release on GitHub",
        "updates.privacy": "Check for updates reads public GitHub release information. Preparing an online update also verifies target and recovery sources. No conversation, draft, or file contents are sent.",
        "updates.cacheNote": "A recent Host result may be reused to respect GitHub limits. There are no scheduled automatic checks.",
        "updates.installAddress": "Installation address (no tag)",
        "updates.copy": "Copy address",
        "updates.copied": "Address copied",
        "updates.copyFailed": "Automatic copy failed. Select and copy the address above manually.",
        "updates.manualUpgrade": "Optional: manual upgrade guide",
        "updates.stepSave": "Save the draft and both feature settings first. Record configuration you want to retain.",
        "updates.stepRemove": "Open DSH plugin management and remove the old dependency by package name:",
        "updates.stepInstall": "Add the plugin again using this installation address without a tag:",
        "updates.stepRestart": "Follow the installation result. If required, or if old modules remain loaded, fully quit and restart DSH. A browser refresh alone does not reload the Host.",
        "updates.backup": "This checker does not change provider/source data. Back up normal DSH configuration and session data before a manual upgrade.",
        noSuggestion: "No next-question suggestion for now. You can type a new question.",
        secondsUnit: "s",
        streamingShort: "Generating",
        showOriginal: "View original",
        generationDetails: "Generation details",
        firstTokenLabel: "First token",
        totalTimeLabel: "Total time",
        warningsLabel: "Warnings",
        chooseSession: "Global switches are available now. To edit session parameters, open the target conversation and return here.",
        returnConversation: "Back to conversation",
        sessionScope: "Model, effort, auxiliary Fast and round settings below apply only to the shown session, not the global switches. Open another conversation first to change the target.",
        editingSession: "Conversation being configured",
        loading: "Loading settings\u2026",
        generatingSuggest: "Suggesting\u2026",
        enableSuggest: "Enable the profile-wide suggestions switch in Prompt assist first.",
        suggestReset: "Input or settings changed; this automatic suggestion was cancelled. Generate manually to retry.",
        suggestRequested: "This Q&A already triggered a suggestion; no automatic duplicate. Retry manually if needed.",
        streaming: "Streaming \u2014 apply becomes available when complete",
        generateSuggest: "Generate next-question suggestion",
        suggestDisabled: "Automatic suggestions are disabled.",
        draftOccupied: "Draft has text, references or attachments. Automatic suggestions are skipped; your draft stays unchanged.",
        waitingQA: "Waiting for the next completed Q&A. You can also generate from existing Q&A below.",
        enhancing: "Enhancing\u2026",
        enableEnhance: "Enable the profile-wide enhancement switch first. Save session model parameters separately below.",
        transportError: "Assist connection failed at the transport layer, not model configuration. Reload the page and retry.",
        authError: "Assist access was denied. Check the current connection and session access.",
        parallel: "Two independent features. Both can be enabled at the same time; these are not alternative modes.",
        suggestContext: "Build the next question from the latest N complete Q&A pairs. Runs after a new completed Q&A while the session is idle and the draft is empty.",
        enhanceOriginal: "Improve the original composer text, using the latest N complete Q&A pairs only as background. Preview leaves the original unchanged.",
        title: "Prompt assist",
        settings: "Settings",
        close: "Collapse",
        suggest: "Next-question suggestions",
        enhance: "Enhance prompt",
        enabled: "Enable this feature",
        follow: "Follow session model and effort",
        followHint: "Only model and effort follow the session. Assist Fast is independent and never changes the main session.",
        provider: "Provider",
        model: "Model",
        effort: "Reasoning effort",
        nativeDefault: "Model default",
        fast: "Assist Fast (independent; extra charges may apply)",
        rounds: "Complete Q&A rounds",
        custom: "Custom",
        save: "Save settings",
        saving: "Saving\u2026",
        saved: "Settings saved",
        selectProvider: "Choose provider",
        selectModel: "Choose model",
        generate: "Preview enhancement",
        generating: "Generating preview\u2026",
        cancel: "Cancel",
        preview: "Separate preview, not native Ghost",
        before: "Original",
        after: "Suggested text",
        accept: "Accept suggestion",
        apply: "Apply to draft",
        copy: "Copy",
        copied: "Copied",
        undo: "Undo this application",
        dismiss: "Dismiss",
        unsupported: "Native Ghost and \u2192 acceptance are not supported. Use the Accept button. This feature does not register Ctrl+Alt+E.",
        structured: "Drafts with references or commands support preview/copy only. Structured apply is not supported; references and attachments stay unchanged.",
        initial: "Profile-wide switches start off; session parameters save separately. Suggestions only follow a NEW complete Q&A. Opening, enabling or reconnecting never replays old Q&A.",
        manual: "Enhancement runs only on click. You can keep editing; edits cancel stale results.",
        busy: "The session is still running. Try again after it ends.",
        requestError: "The request did not finish. Your draft is unchanged. Check settings and retry.",
        fastSkipped: "This model does not support assist Fast, so this request ran without Priority. Your saved Fast setting is unchanged.",
        emptyResult: "The model returned no usable text, so nothing was applied. Your draft is unchanged. Retry, or lower the reasoning effort and retry.",
        cancelled: "Generation was cancelled; nothing was applied. Your draft is unchanged.",
        modelFailed: "The model request failed (provider or network), so nothing was applied. Your draft is unchanged. Retry later or check that provider configuration.",
        safeCodeLabel: "Safe error code",
        configError: "The model, effort, or settings are invalid. Select again and save.",
        contextError: "Complete Q&A is unavailable, or input is estimated to exceed the model context window. Reduce input/rounds or check provider/model settings; input is not silently truncated.",
        fileError: "File not read: it may be oversized, sensitive, or unsupported. Deselect it and retry.",
        stale: "The draft changed. Nothing was applied. Generate a new preview.",
        roundsError: "Custom rounds must be an integer from 1 to 20.",
        modelError: "Choose a provider and model.",
        references: "Current draft references",
        readFile: "Use this file for this enhancement",
        unread: "Content not read",
        namesOnly: "Visible reference name only",
        fileLimits: "Only checked files are read: \u226464 KiB each, \u2264128 KiB total. Folders, session references, and uploaded attachments are not read.",
        attachments: "{{count}} attachment(s). Content is not read; applying text leaves attachments unchanged.",
        effortInvalid: "This model does not support the saved effort. Select explicitly; no automatic downgrade.",
        fastUnsupported: "This model does not support assist Fast. If enabled, uncheck it before saving.",
        route: "Actual route",
        timing: "First token {{ttft}} ms \xB7 Total {{total}} ms",
        filesRead: "Files read",
        warnings: "{{count}} processing warning(s)",
        empty: "Write a prompt in the composer, then click Preview.",
        access: "This session is read-only. Requests and apply are unavailable.",
        load: "Loading assist settings\u2026",
        settingsChanged: "Settings have unsaved changes. Save before requesting.",
        budgetPolicy: "Input context and output budgets follow the selected provider/model settings. With no configured output cap, native/provider defaults apply. Larger budgets may increase time and cost. The 120-second wait and independent file-access safeguards remain. Main conversation controls are unchanged.",
        contextUnknown: "The model context window or Host token estimator is unavailable. No generation was dispatched. Check provider/model configuration and Host compatibility.",
        requestTimeout: "The auxiliary request reached its wait limit. Nothing was applied or retried automatically. Check model latency or reasoning settings.",
        budget: "Requested output budget: {{tokens}} tokens, wait limit: {{seconds}} s. Reasoning may share this budget; no automatic retry or effort change.",
        outputLimit: "The model reached the output budget. Nothing was applied; no automatic retry or effort change.",
        cached: "Session cache hit; the timings below belong to the original generation."
      }
    };
  }
});

// assist/client/result-layout.js
function compactPanelModifier({ pending, preview, referenceCount, notice, validUndo }) {
  if (preview || referenceCount || notice) return "";
  if (pending) return " lpa-inline--pending";
  return validUndo ? " lpa-inline--undo" : "";
}
var init_result_layout = __esm({
  "assist/client/result-layout.js"() {
  }
});

// assist/client/panel-visibility.js
function shouldShowPanel({ open, result, undo, input, sessionId }) {
  const preview = ownsResult(result?.preview, sessionId);
  const actionableUndo = ownsResult(undo, sessionId) && input.draft === undo.original && input.draftRev === undo.draftRev;
  return Boolean(open || preview || ownsResult(result?.noSuggestion, sessionId) || result?.pending || result?.error || actionableUndo);
}
var init_panel_visibility = __esm({
  "assist/client/panel-visibility.js"() {
    init_editor();
  }
});

// assist/client/api.js
function sessionSettings(value = {}) {
  return Object.fromEntries(SESSION_FIELDS.map((key) => [key, value[key] ?? DEFAULT_SETTINGS[key]]));
}
function configKey(settings) {
  return JSON.stringify(["suggest", "enhance"].map((key) => {
    const config = settings?.[key] ?? DEFAULT_SETTINGS;
    return Object.keys(DEFAULT_SETTINGS).map((name) => config[name]);
  }));
}
function validateSettings(value) {
  if (!Number.isInteger(value.rounds) || value.rounds < 1 || value.rounds > 20) return "rounds";
  if (!value.followSession && (!value.provider || !value.model)) return "model";
  return null;
}
function selectedFileOf(occurrence) {
  if (occurrence?.source !== "reference" || occurrence.appearance !== "file") return null;
  const ref = occurrence.ref;
  if (typeof ref !== "string" || typeof occurrence.label !== "string") return null;
  let path;
  if (/^@"[^"\r\n]+"$/.test(ref)) path = ref.slice(2, -1);
  else if (/^@[^\s"\r\n]+$/.test(ref)) path = ref.slice(1);
  if (!path || path.endsWith("/") || path.endsWith("\\")) return null;
  return { name: occurrence.label, path };
}
function referenceNames(occurrences = []) {
  return occurrences.flatMap((item) => typeof item?.label === "string" ? [{ name: item.label }] : []);
}
function errorKey(error) {
  const raw = typeof error === "string" ? error : error?.code;
  const code2 = typeof raw === "string" ? raw.toLowerCase() : "request_failed";
  if (code2 === "fast-unsupported") return "fastUnsupported";
  if (code2 === "empty-result") return "emptyResult";
  if (code2 === "cancelled") return "cancelled";
  if (code2 === "model-failed") return "modelFailed";
  if (code2.startsWith("transport-")) return "transportError";
  if (code2 === "forbidden") return "authError";
  if (code2 === "output-limit") return "outputLimit";
  if (code2 === "timeout") return "requestTimeout";
  if (code2 === "context-unknown") return "contextUnknown";
  if (/stale|changed|revision/.test(code2)) return "stale";
  if (/context|overflow/.test(code2)) return "contextError";
  if (/file|secret|binary|oversize/.test(code2)) return "fileError";
  if (/model|effort|provider|config/.test(code2)) return "configError";
  if (/busy/.test(code2)) return "busy";
  return "requestError";
}
function reconcileState(host, wire, session, allowed) {
  const state = wire ? { ...host, ...wire } : host;
  const fresh = Boolean(host) && (!wire || host.qaId === wire.qaId);
  const busy = !fresh || host?.busy === true || wire?.busy === true || session?.running === true || !allowed;
  return { state, busy };
}
function catalogInput(config, provider) {
  return config.followSession ? {} : { provider };
}
function safeCode(error) {
  const code2 = typeof error === "string" ? error : error?.code;
  return typeof code2 === "string" && code2.length > 0 && code2.length <= 64 && !/[^a-z0-9-]/u.test(code2) ? code2 : "unknown";
}
function errorText(error, t) {
  const key = errorKey(error);
  return t(key) + (key === "requestError" ? " " + t("safeCodeLabel") + " " + safeCode(error) : "");
}
var DEFAULT_SETTINGS, SESSION_FIELDS;
var init_api = __esm({
  "assist/client/api.js"() {
    init_identity();
    DEFAULT_SETTINGS = Object.freeze({
      enabled: false,
      followSession: true,
      provider: "",
      model: "",
      reasoningEffort: "",
      fast: false,
      rounds: 1
    });
    SESSION_FIELDS = Object.freeze(["followSession", "provider", "model", "reasoningEffort", "fast", "rounds"]);
  }
});

// assist/client/stream-preview.js
function streamPreview({ isCurrent, publish, snapshot, sessionId, qaId, feature }) {
  return (text) => {
    if (feature === "suggest" || !isCurrent() || typeof text !== "string") return;
    publish({ preview: { text, original: snapshot.original, draftRev: snapshot.draftRev, sessionId, qaId, feature, streaming: true, snapshot } });
  };
}
var init_stream_preview = __esm({
  "assist/client/stream-preview.js"() {
  }
});

// assist/suggestion-result.js
function isNoSuggestionPlaceholder(text) {
  return typeof text === "string" && /^(?:暂无(?:下一问)?建议|no suggestions?(?: available)?)[。.!！]?$/iu.test(text.trim());
}
var init_suggestion_result = __esm({
  "assist/suggestion-result.js"() {
  }
});

// assist/client/controller.js
function qaEndOf(id2) {
  const match = typeof id2 === "string" ? /^(\d+):(\d+)$/.exec(id2) : null;
  const end = match ? Number(match[2]) : 0;
  return Number.isSafeInteger(end) ? end : 0;
}
function createAssistController(deps) {
  let current;
  let knownQA = false;
  let latestQAEnd = 0;
  let candidate = null;
  let flight = null;
  let epoch = 0;
  let disposed = false;
  const requested = /* @__PURE__ */ new Set();
  const state = { pending: null, preview: null, noSuggestion: null, error: null, trigger: null };
  const publish = (patch) => {
    Object.assign(state, patch);
    deps.publish({ ...state });
  };
  const explain = (status, reason) => {
    const trigger = { status, reason, qaId: current?.qaId ?? null, candidate, busy: current?.busy === true };
    if (JSON.stringify(trigger) !== JSON.stringify(state.trigger)) publish({ trigger });
  };
  const cancel = () => {
    epoch += 1;
    flight?.abort();
    flight = null;
    if (state.pending || state.noSuggestion) publish({ pending: null, noSuggestion: null, ...state.preview?.streaming ? { preview: null } : {} });
  };
  const configured = (feature) => current?.settings?.[feature]?.enabled === true && (current.settings[feature].followSession || Boolean(current.settings[feature].provider && current.settings[feature].model));
  function observe(next) {
    if (disposed) return;
    const previous = current;
    const changedSession = previous && previous.sessionId !== next.sessionId;
    const changedRoute = previous && previous.routeKey !== next.routeKey;
    const hydratedRoute = changedRoute && (previous.routeKey == null || previous.routeKey === "null") && next.routeKey != null && next.routeKey !== "null";
    const changedConfig = previous && (configKey(previous.settings) !== configKey(next.settings) || changedRoute && !hydratedRoute || previous.paused !== next.paused);
    const changedInput = previous && !sameInput(previous.input, next.input);
    const changedQA = previous && previous.qaId !== next.qaId;
    const changedBusy = previous && previous.busy !== next.busy;
    const backgroundInvalid = (changedQA || changedBusy) && state.pending !== "enhance" && state.preview?.feature !== "enhance";
    if (changedSession || changedConfig || changedRoute || changedInput || backgroundInvalid) cancel();
    if (changedSession || changedConfig || changedInput) candidate = null;
    if (changedSession) {
      knownQA = false;
      requested.clear();
    }
    current = next;
    if (changedSession || changedConfig || changedRoute || changedInput || changedQA && backgroundInvalid) publish({ preview: null, error: null });
    if (next.qaId === void 0) {
      explain("waiting", "qa-unavailable");
      return;
    }
    if (!knownQA) {
      knownQA = true;
      latestQAEnd = qaEndOf(next.qaId);
      candidate = null;
      explain("skipped", "baseline");
      return;
    }
    if (changedQA) {
      const end = qaEndOf(next.qaId);
      candidate = end > latestQAEnd && configured("suggest") && canSuggest(next.input) ? next.qaId : null;
      latestQAEnd = Math.max(latestQAEnd, end);
    }
    if (candidate && !next.paused && !next.busy && configured("suggest") && canSuggest(next.input)) {
      const key = `${next.sessionId}:${candidate}`;
      if (!requested.has(key)) {
        requested.add(key);
        if (requested.size > 64) requested.delete(requested.values().next().value);
        candidate = null;
        explain("requested", "new-qa");
        void generate("suggest");
        return;
      }
    }
    if (next.paused) explain("skipped", "configuration-editing");
    else if (!configured("suggest")) explain("skipped", "suggest-not-configured");
    else if (!canSuggest(next.input)) explain("skipped", "input-ineligible");
    else if (candidate && next.busy) explain("waiting", "busy-or-unhydrated");
    else if (changedConfig) explain("skipped", changedRoute ? "route-changed" : "configuration-changed");
    else if (changedInput) explain("skipped", "input-changed");
    else if (requested.has(`${next.sessionId}:${next.qaId}`)) explain("skipped", "already-requested");
    else explain("skipped", "no-new-qa");
  }
  async function generate(feature, selectedFiles = []) {
    if (disposed || !current || current.paused || !configured(feature)) return false;
    if (current.input.phase === "adjudicating" || current.input.phase === "submitting") return false;
    if (feature === "suggest" && (current.busy || !canSuggest(current.input))) return false;
    if (feature === "enhance" && current.input.draft.trim() === "") return false;
    cancel();
    const snapshot = captureText(current.input, deps.actions());
    if (!snapshot) {
      publish({ error: "stale" });
      return false;
    }
    const revision = epoch;
    const sessionId = current.sessionId;
    const qaId = current.qaId;
    const abort = new AbortController();
    flight = abort;
    publish({ pending: feature, error: null, preview: null });
    try {
      const result = await deps.send("generate", sessionId, {
        feature,
        requestId: deps.requestId(),
        draft: snapshot.original,
        draftRev: snapshot.draftRev,
        qaId,
        files: selectedFiles,
        references: referenceNames(current.input.occurrences)
      }, abort.signal, streamPreview({
        isCurrent: () => !disposed && !abort.signal.aborted && revision === epoch,
        publish,
        snapshot,
        sessionId,
        qaId,
        feature
      }));
      if (disposed || abort.signal.aborted || revision !== epoch) return false;
      if (!result || result.draftRev !== snapshot.draftRev || result.original !== snapshot.original || result.feature !== feature || feature === "suggest" && result.qaId !== qaId) {
        publish({ error: "stale", preview: null });
        return false;
      }
      const noSuggestion = result.outcome === "no-suggestion";
      const validText = typeof result.text === "string" && result.text.trim() !== "";
      const validOutcome = noSuggestion ? feature === "suggest" && result.text === "" : validText && (feature === "suggest" ? (result.outcome === void 0 || result.outcome === "suggestion") && !isNoSuggestionPlaceholder(result.text) : result.outcome === void 0);
      if (!validOutcome) {
        publish({ error: "requestError", preview: null, noSuggestion: null });
        return false;
      }
      const receipt = { ...result, sessionId, snapshot: { ...snapshot, structured: snapshot.structured || result.structured === true } };
      publish(noSuggestion ? { noSuggestion: receipt, preview: null } : { preview: receipt, noSuggestion: null });
      return true;
    } catch (error) {
      if (!disposed && !abort.signal.aborted && revision === epoch) publish({ error, preview: null });
      return false;
    } finally {
      if (!disposed && revision === epoch) {
        flight = null;
        publish({ pending: null });
      }
    }
  }
  return {
    observe,
    generate,
    mount() {
      disposed = false;
      current = void 0;
      knownQA = false;
      candidate = null;
      Object.assign(state, { pending: null, preview: null, noSuggestion: null, error: null, trigger: null });
    },
    cancel() {
      candidate = null;
      cancel();
    },
    dismiss() {
      candidate = null;
      cancel();
      publish({ preview: null, error: null });
    },
    configurationEdited() {
      candidate = null;
      cancel();
      publish({ preview: null });
    },
    dispose() {
      disposed = true;
      candidate = null;
      cancel();
    }
  };
}
var init_controller = __esm({
  "assist/client/controller.js"() {
    init_stream_preview();
    init_suggestion_result();
    init_api();
    init_editor();
  }
});

// assist/client/enablement-source.js
function normalizeEnablement(value) {
  if (!value || value.scope !== "profile" || !Number.isSafeInteger(value.revision) || value.revision < 0 || !value.enabled || FEATURES.some((feature) => typeof value.enabled[feature] !== "boolean")) throw invalid();
  return Object.freeze({ scope: "profile", revision: value.revision, enabled: Object.freeze({ suggest: value.enabled.suggest, enhance: value.enabled.enhance }) });
}
function mergeGlobalSettings(settings, global) {
  return Object.fromEntries(FEATURES.map((feature) => [feature, { ...sessionSettings(settings?.[feature]), enabled: global?.connected === true && global.data?.enabled[feature] === true }]));
}
function createEnablementObserver(controller) {
  let previous;
  return (frame, global) => {
    const identity = JSON.stringify([global?.connected === true, global?.data?.revision ?? null]);
    if (previous !== void 0 && identity !== previous) {
      controller.configurationEdited();
      controller.mount();
    }
    previous = identity;
    controller.observe(frame);
  };
}
function createEnablementSource({ send, fetcher = (...args) => globalThis.fetch(...args), setTimer = setTimeout, clearTimer = clearTimeout }) {
  let state = initial(), disposed = true, epoch = 0, readEpoch = 0, readAbort = null, writeAbort = null, watchAbort = null, reader = null, timer = null, backoff = 1e3;
  const listeners2 = /* @__PURE__ */ new Set();
  const publish = (patch) => {
    if (Object.keys(patch).every((key) => state[key] === patch[key])) return;
    state = { ...state, ...patch };
    for (const listener of listeners2) listener();
  };
  const accept = (value) => {
    const data = normalizeEnablement(value), old = state.data;
    if (old && data.revision < old.revision) return false;
    if (old && data.revision === old.revision) {
      if (FEATURES.some((key) => data.enabled[key] !== old.enabled[key])) throw invalid();
      return true;
    }
    publish({ data, saved: null });
    return true;
  };
  const clearRetry = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  async function load() {
    if (disposed) return false;
    readAbort?.abort();
    const abort = new AbortController(), revision = ++readEpoch, owner = epoch;
    readAbort = abort;
    publish({ loading: true, readError: null });
    try {
      const value = await send("enablement", void 0, {}, abort.signal);
      if (disposed || owner !== epoch || revision !== readEpoch) return false;
      accept(value);
      return true;
    } catch (error) {
      if (!disposed && owner === epoch && revision === readEpoch) publish({ readError: error?.code === "transport-invalid-response" ? "transport-invalid-response" : "global-unavailable" });
      return false;
    } finally {
      if (!disposed && owner === epoch && revision === readEpoch) {
        readAbort = null;
        publish({ loading: false });
      }
    }
  }
  async function watch() {
    if (disposed) return;
    const owner = epoch, abort = new AbortController();
    watchAbort = abort;
    let ownedReader;
    try {
      const response = await fetcher(ENABLEMENT_PATH2, { method: "GET", credentials: "same-origin", signal: abort.signal });
      if (disposed || owner !== epoch || abort.signal.aborted) {
        await response.body?.cancel();
        return;
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw invalid();
      }
      ownedReader = response.body.getReader();
      reader = ownedReader;
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let buffer = "";
      const frame = (line) => {
        if (!line.trim()) return;
        if (line.length > 16384) throw invalid();
        let value;
        try {
          value = JSON.parse(line);
        } catch {
          throw invalid();
        }
        if (accept(value)) {
          backoff = 1e3;
          publish({ connected: true, loading: false, readError: null });
        }
      };
      for (; ; ) {
        const { value, done } = await ownedReader.read();
        if (disposed || owner !== epoch || abort.signal.aborted) return;
        if (done) {
          buffer += decoder.decode();
          if (buffer) frame(buffer);
          throw new Error("watch-ended");
        }
        buffer += decoder.decode(value, { stream: true });
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
          frame(buffer.slice(0, index));
          buffer = buffer.slice(index + 1);
        }
        if (buffer.length > 16384) throw invalid();
      }
    } catch (error) {
      if (!disposed && owner === epoch && !abort.signal.aborted) {
        publish({ connected: false, loading: false, readError: error?.code === "transport-invalid-response" ? "transport-invalid-response" : "global-unavailable", saved: null });
        clearRetry();
        timer = setTimer(() => {
          timer = null;
          void watch();
        }, backoff);
        backoff = Math.min(3e4, backoff * 2);
      }
    } finally {
      try {
        await ownedReader?.cancel();
      } catch {
      }
      try {
        ownedReader?.releaseLock();
      } catch {
      }
      if (reader === ownedReader) reader = null;
      if (watchAbort === abort) watchAbort = null;
    }
  }
  async function setEnabled(feature, enabled) {
    if (disposed || state.pending || !state.connected || !state.data || !FEATURES.includes(feature) || typeof enabled !== "boolean") return false;
    const owner = epoch, expectedRevision = state.data.revision, abort = new AbortController();
    writeAbort = abort;
    publish({ pending: feature, writeError: null, saved: null });
    try {
      const value = await send("set-enabled", void 0, { feature, enabled, expectedRevision }, abort.signal);
      if (disposed || owner !== epoch || abort.signal.aborted) return false;
      const accepted = accept(value);
      if (!accepted || state.data.enabled[feature] !== enabled) {
        publish({ writeError: "stale-enablement" });
        await load();
        return false;
      }
      publish({ saved: { feature, revision: state.data.revision } });
      return true;
    } catch (error) {
      if (!disposed && owner === epoch && !abort.signal.aborted) {
        const stale = error?.code === "stale-enablement";
        publish({ writeError: stale ? "stale-enablement" : "global-save-failed" });
        if (stale) await load();
      }
      return false;
    } finally {
      if (!disposed && owner === epoch) {
        writeAbort = null;
        publish({ pending: null });
      }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners2.add(listener);
      return () => listeners2.delete(listener);
    },
    start() {
      if (!disposed) return Promise.resolve(false);
      disposed = false;
      epoch++;
      publish({ connected: false, pending: null, saved: null });
      void watch();
      return load();
    },
    load,
    setEnabled,
    dispose() {
      disposed = true;
      epoch++;
      readEpoch++;
      clearRetry();
      readAbort?.abort();
      writeAbort?.abort();
      watchAbort?.abort();
      void reader?.cancel().catch(() => {
      });
      readAbort = null;
      writeAbort = null;
      watchAbort = null;
      reader = null;
      state = { ...state, connected: false, pending: null, saved: null };
    }
  };
}
var ENABLEMENT_PATH2, FEATURES, invalid, initial, empty, EMPTY_ENABLEMENT_SOURCE;
var init_enablement_source = __esm({
  "assist/client/enablement-source.js"() {
    init_api();
    init_identity();
    ENABLEMENT_PATH2 = ENABLEMENT_PATH.slice(1);
    FEATURES = ["suggest", "enhance"];
    invalid = () => Object.assign(new Error("transport-invalid-response"), { code: "transport-invalid-response" });
    initial = () => ({ data: null, connected: false, loading: true, pending: null, readError: null, writeError: null, saved: null });
    empty = Object.freeze(initial());
    EMPTY_ENABLEMENT_SOURCE = Object.freeze({ getSnapshot: () => empty, subscribe: () => () => {
    }, load: async () => false, setEnabled: async () => false });
  }
});

// assist/client/runtime.js
function useAssistRuntime(p) {
  const globalSource = p.globalSource ?? EMPTY_ENABLEMENT_SOURCE;
  const enablement = import_react3.default.useSyncExternalStore(globalSource.subscribe, globalSource.getSnapshot, globalSource.getSnapshot);
  const input = p.useInput((s) => s);
  const session = p.useSession((s) => s);
  const wire = import_react3.default.useSyncExternalStore(p.assistSource.subscribe, p.assistSource.getSnapshot, p.assistSource.getSnapshot);
  const selection = import_react3.default.useSyncExternalStore(p.assistModel.subscribe, p.assistModel.getSnapshot, p.assistModel.getSnapshot);
  const [host, setHost] = import_react3.default.useState(null);
  const [result, setResult] = import_react3.default.useState({ pending: null, preview: null, noSuggestion: null, error: null });
  const [notice, setNotice] = import_react3.default.useState(null);
  const [saving, setSaving] = import_react3.default.useState(false);
  const [dirtyFeatures, setDirtyFeatures] = import_react3.default.useState([]);
  const editVersions = import_react3.default.useRef({ suggest: 0, enhance: 0 });
  const saves = import_react3.default.useRef(/* @__PURE__ */ new Set());
  const current = import_react3.default.useRef({ input, actions: p.inputActions, sessionId: p.sessionId });
  current.current = { input, actions: p.inputActions, sessionId: p.sessionId };
  const alive = import_react3.default.useRef(false);
  const send = p.assistSend;
  const controller = import_react3.default.useMemo(() => createAssistController({ send, actions: () => current.current.actions, publish: (value) => {
    if (alive.current) setResult(value);
  }, requestId: () => globalThis.crypto.randomUUID() }), [p.sessionId, send]);
  const observeEnablement = import_react3.default.useMemo(() => createEnablementObserver(controller), [controller]);
  const hostValue = host?.sessionId === p.sessionId ? host.value : null;
  const allowed = p.useAccess("commands/execute") && !session?.subagent && !session?.removed;
  const reconciled = reconcileState(hostValue, wire, session, allowed);
  const busy = reconciled.busy || !enablement.connected;
  const sessionSettingsValue = reconciled.state?.settings ?? EMPTY;
  const settings = import_react3.default.useMemo(() => mergeGlobalSettings(sessionSettingsValue, enablement), [sessionSettingsValue, enablement.connected, enablement.data]);
  const state = reconciled.state ? { ...reconciled.state, settings } : null;
  const dirty = dirtyFeatures.length > 0;
  const route = selection?.next ?? state?.current;
  const routeKey = JSON.stringify(route ?? null);
  import_react3.default.useEffect(() => {
    alive.current = true;
    controller.mount();
    setHost(null);
    setDirtyFeatures([]);
    setNotice(null);
    setSaving(false);
    setResult({ pending: null, preview: null, noSuggestion: null, error: null });
    p.refreshAssist().catch(() => {
    });
    return () => {
      alive.current = false;
      for (const save2 of saves.current) save2.abort();
      saves.current.clear();
      controller.dispose();
    };
  }, [p.sessionId, controller, send]);
  import_react3.default.useEffect(() => {
    if (wire?.busy || session?.running) return;
    const abort = new AbortController();
    send("state", p.sessionId, {}, abort.signal).then((value) => {
      if (!abort.signal.aborted) {
        setHost({ sessionId: p.sessionId, value });
        setNotice(null);
      }
    }).catch((error) => {
      if (!abort.signal.aborted) setNotice(error);
    });
    return () => abort.abort();
  }, [p.sessionId, send, wire?.qaId, wire?.busy, session?.running]);
  import_react3.default.useEffect(() => {
    observeEnablement({ sessionId: p.sessionId, input, settings, qaId: state?.qaId, busy, paused: dirty, routeKey }, enablement);
  }, [observeEnablement, p.sessionId, input, settings, state?.qaId, busy, dirty, routeKey, enablement.connected, enablement.data?.revision]);
  async function save(feature, config) {
    if (saving || !allowed) return;
    controller.configurationEdited();
    setSaving(true);
    setNotice(null);
    const version3 = editVersions.current[feature];
    const owner = p.sessionId;
    const abort = new AbortController();
    saves.current.add(abort);
    const valid = () => alive.current && !abort.signal.aborted && current.current.sessionId === owner;
    try {
      const value = await send("save", owner, { feature, config: sessionSettings(config) }, abort.signal);
      if (!valid()) return;
      setHost({ sessionId: owner, value });
      await p.refreshAssist();
      if (!valid()) return;
      if (editVersions.current[feature] === version3) {
        setDirtyFeatures((old) => old.filter((key) => key !== feature));
        setNotice("saved");
        return true;
      }
    } catch (error) {
      if (valid()) setNotice(error);
    } finally {
      saves.current.delete(abort);
      if (valid()) setSaving(false);
    }
  }
  function edited(feature) {
    editVersions.current[feature] += 1;
    setDirtyFeatures((old) => old.includes(feature) ? old : [...old, feature]);
    setNotice(null);
    controller.configurationEdited();
  }
  return { sessionId: p.sessionId, input, session, state, currentModel: route, settings, result, controller, send, save, edited, dirty, dirtyFeatures, saving, notice, setNotice, allowed, busy, readInput: () => current.current.input };
}
function useModelOptions(runtime, feature, config, open) {
  const [catalog, setCatalog] = import_react3.default.useState({ providers: [], models: [] });
  const [capabilities, setCapabilities] = import_react3.default.useState(null);
  const [error, setError] = import_react3.default.useState(null);
  const current = runtime.currentModel;
  const provider = config.followSession ? current?.provider : config.provider;
  const model = config.followSession ? current?.model : config.model;
  import_react3.default.useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    setError(null);
    runtime.send("catalog", runtime.sessionId, catalogInput(config, provider), abort.signal).then((value) => {
      if (!abort.signal.aborted) setCatalog(value);
    }).catch((error2) => {
      if (!abort.signal.aborted) setError(error2);
    });
    return () => abort.abort();
  }, [runtime.send, runtime.sessionId, open, provider, config.followSession]);
  import_react3.default.useEffect(() => {
    setCapabilities(null);
    setError(null);
    if (!open || !provider || !model) return;
    const abort = new AbortController();
    runtime.send("model", runtime.sessionId, { provider, model }, abort.signal).then((value) => {
      if (!abort.signal.aborted) setCapabilities(value);
    }).catch((error2) => {
      if (!abort.signal.aborted) setError(error2);
    });
    return () => abort.abort();
  }, [runtime.send, runtime.sessionId, open, provider, model, feature]);
  return { catalog, capabilities, error };
}
var import_react3, EMPTY;
var init_runtime = __esm({
  "assist/client/runtime.js"() {
    import_react3 = __toESM(require("react"), 1);
    init_api();
    init_controller();
    init_enablement_source();
    EMPTY = { suggest: DEFAULT_SETTINGS, enhance: DEFAULT_SETTINGS };
  }
});

// assist/client/duration.js
function formatDuration(milliseconds, unit) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "\u2014";
  return String(Math.floor(milliseconds / 1e3)) + unit;
}
var init_duration = __esm({
  "assist/client/duration.js"() {
  }
});

// assist/client/preview.js
function NoSuggestion({ runtime: r, t }) {
  const value = r.result.noSuggestion;
  if (!ownsResult(value, r.sessionId) || value.feature !== "suggest" || value.outcome !== "no-suggestion" || value.text !== "") return null;
  return h3(
    "div",
    { className: "lpa-row lpa-note", role: "status" },
    h3("span", null, t("noSuggestion")),
    value.fastSkipped === true ? h3("span", { className: "lpa-note" }, t("fastSkipped")) : null,
    h3("button", { type: "button", className: "lpa-button", onClick: () => r.controller.dismiss() }, t("dismiss"))
  );
}
function Preview({ runtime: r, actions, t, onApplied }) {
  const value = r.result.preview;
  if (!value || !ownsResult(value, r.sessionId)) return null;
  if (value.feature === "suggest" && (value.outcome !== void 0 && value.outcome !== "suggestion" || typeof value.text !== "string" || !value.text.trim() || isNoSuggestionPlaceholder(value.text))) return null;
  const blocked = value.snapshot.structured;
  const button = (key, action, disabled = false, primary = false) => h3("button", { type: "button", className: "lpa-button" + (primary ? " lpa-button--primary" : ""), onClick: action, disabled }, t(key));
  function apply2() {
    if (value.streaming || !ownsResult(value, r.sessionId)) return;
    const outcome = applyText(value.snapshot, value.text, r.readInput, actions);
    if (outcome.ok) {
      onApplied({ ...outcome.undo, sessionId: r.sessionId });
      r.controller.dismiss();
    } else r.setNotice(outcome.reason);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(value.text);
      r.setNotice("copied");
    } catch {
      r.setNotice("requestError");
    }
  }
  const diagnostics = value.route || value.timing || value.filesRead?.length || value.warnings?.length;
  return h3(
    "section",
    { className: "lpa-preview", "aria-label": t(value.feature), "aria-busy": Boolean(value.streaming) },
    h3("header", { className: "lpa-preview-header" }, h3("span", null, t(value.feature)), value.streaming ? h3("span", { className: "lpa-preview-status" }, t("streamingShort")) : null),
    h3("pre", { className: "lpa-result-text" }, value.text),
    value.fastSkipped === true ? h3("p", { className: "lpa-note", role: "status" }, t("fastSkipped")) : null,
    blocked ? h3("p", { className: "lpa-note" }, t("structured")) : null,
    h3(
      "div",
      { className: "lpa-preview-actions" },
      button(value.feature === "suggest" ? "accept" : "apply", apply2, value.streaming || blocked || !r.allowed || value.feature === "suggest" && r.busy || r.dirty, true),
      button("copy", copy, Boolean(value.streaming)),
      value.streaming ? button("cancel", () => r.controller.cancel()) : button("dismiss", () => r.controller.dismiss())
    ),
    h3(
      "div",
      { className: "lpa-preview-meta" },
      value.feature === "enhance" ? h3("details", null, h3("summary", null, t("showOriginal")), h3("pre", null, value.original)) : null,
      diagnostics ? h3(
        "details",
        null,
        h3("summary", null, t("generationDetails")),
        value.route ? h3("p", null, t("route"), ": ", [value.route.provider, value.route.model, value.route.reasoningEffort, value.route.fast ? t("fast") : ""].filter(Boolean).join(" / ")) : null,
        value.timing ? h3("p", null, t("firstTokenLabel"), ": ", formatDuration(value.timing.ttftMs, t("secondsUnit")), " \xB7 ", t("totalTimeLabel"), ": ", formatDuration(value.timing.totalMs, t("secondsUnit"))) : null,
        value.filesRead?.length ? h3("p", null, t("filesRead"), ": ", value.filesRead.map((f) => f.name).join(", ")) : null,
        value.warnings?.length ? h3("p", null, t("warningsLabel"), ": ", value.warnings.length) : null
      ) : null
    )
  );
}
var import_react4, h3;
var init_preview = __esm({
  "assist/client/preview.js"() {
    init_suggestion_result();
    import_react4 = __toESM(require("react"), 1);
    init_duration();
    init_editor();
    h3 = import_react4.default.createElement;
  }
});

// assist/client/selected-files.js
function SelectedFiles({ input, files, onChange, t }) {
  if (!input.occurrences.length) return null;
  return h4(
    "details",
    { className: "lpa-details" },
    h4("summary", null, t("references")),
    h4("p", { className: "lpa-note" }, t("fileLimits")),
    input.occurrences.map((occ, index) => {
      const entry = selectedFileOf(occ), key = String(occ.occurrenceId ?? index);
      return h4("div", { className: "lpa-reference", key }, entry ? h4("label", { className: "lpa-check" }, h4("input", { type: "checkbox", checked: Boolean(files[key]), "aria-label": t("readFile") + ": " + entry.name, onChange: (e) => onChange(key, e.target.checked ? entry : null) }), entry.name, h4("span", { className: "lpa-note" }, entry.path)) : h4("span", null, occ.label ?? t("references"), " \xB7 ", t("namesOnly")));
    })
  );
}
var import_react5, h4;
var init_selected_files = __esm({
  "assist/client/selected-files.js"() {
    import_react5 = __toESM(require("react"), 1);
    init_api();
    h4 = import_react5.default.createElement;
  }
});

// assist/client/panel.js
function AssistPanel(p) {
  const r = useAssistRuntime(p), t = p.t;
  const [files, setFiles] = import_react6.default.useState({}), [undo, setUndo] = import_react6.default.useState(null);
  import_react6.default.useEffect(() => {
    if (!r.session?.subagent && !r.session?.removed) p.settingsTarget.select(p.sessionId);
  }, [p.settingsTarget, p.sessionId, r.session?.subagent, r.session?.removed]);
  import_react6.default.useEffect(() => () => {
    p.assistEnhance.clear();
    p.assistSuggest.clear();
  }, [p.assistEnhance, p.assistSuggest]);
  import_react6.default.useEffect(() => {
    p.assistEnhance.update(enhanceAvailability(r), () => r.controller.generate("enhance", Object.values(files).filter(Boolean)));
    p.assistSuggest.update(suggestAvailability(r), () => r.controller.generate("suggest"));
  }, [p.assistEnhance, p.assistSuggest, r.controller, r.allowed, r.state, r.settings, r.dirty, r.busy, r.input, r.result.pending, files]);
  import_react6.default.useEffect(() => {
    setFiles({});
  }, [p.sessionId, r.input.draftRev]);
  import_react6.default.useEffect(() => {
    setUndo(null);
  }, [p.sessionId]);
  const visible = shouldShowPanel({ open: false, result: r.result, undo, input: r.input, sessionId: p.sessionId });
  if (r.session?.subagent || r.session?.removed || !visible && !r.input.occurrences.length) return null;
  const button = (key, onClick, disabled = false) => h5("button", { type: "button", className: "lpa-button", onClick, disabled }, t(key));
  const validUndo = ownsResult(undo, p.sessionId) && r.input.draft === undo.original && r.input.draftRev === undo.draftRev;
  const undoApply = () => {
    const result = undoText(undo, r.readInput, p.inputActions);
    if (result.ok) setUndo(null);
    else r.setNotice(result.reason);
  };
  const dismiss = () => {
    r.controller.dismiss();
    r.setNotice(null);
  };
  const notice = r.result.error ?? r.notice;
  return h5(
    "section",
    { className: "lpa lpa-inline" + compactPanelModifier({ pending: r.result.pending, preview: r.result.preview, referenceCount: r.input.occurrences.length, notice, validUndo }), "aria-label": t("preview") },
    h5("style", null, css),
    h5(SelectedFiles, { input: r.input, files, t, onChange: (key, entry) => {
      r.controller.dismiss();
      setFiles((old) => ({ ...old, [key]: entry }));
    } }),
    r.result.pending && !r.result.preview ? h5("div", { className: "lpa-row lpa-pending", role: "status" }, h5("span", { className: "lpa-pending-mark", "aria-hidden": true }), t(r.result.pending === "suggest" ? "generatingSuggest" : "generating"), button("cancel", () => r.controller.cancel())) : null,
    h5(NoSuggestion, { runtime: r, t }),
    h5(Preview, { runtime: r, actions: p.inputActions, t, onApplied: setUndo }),
    validUndo ? h5("div", { className: "lpa-undo-actions" }, button("undo", undoApply, !r.allowed)) : null,
    visible && notice ? h5("div", { className: "lpa-row", role: "status" }, h5("span", { className: r.result.error ? "lpa-error" : "lpa-note" }, typeof notice === "string" && notice !== "requestError" ? t(notice) : errorText(notice, t)), button("dismiss", dismiss)) : null
  );
}
var import_react6, h5;
var init_panel = __esm({
  "assist/client/panel.js"() {
    init_result_layout();
    import_react6 = __toESM(require("react"), 1);
    init_enhance_action();
    init_panel_visibility();
    init_runtime();
    init_preview();
    init_selected_files();
    init_editor();
    init_api();
    init_style();
    h5 = import_react6.default.createElement;
  }
});

// assist/client/update-state.js
function safeReleaseUrl(value) {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.search || url.hash) return null;
    const parts = url.pathname.split("/");
    if (parts.length !== 6 || parts[1].toLowerCase() !== "syngnat" || parts[2].toLowerCase() !== "dsh-prompt-assist" || parts[3] !== "releases" || parts[4] !== "tag") return null;
    const tag = decodeURIComponent(parts[5]);
    if (!/^v?\d+\.\d+\.\d+(?:\+[a-zA-Z0-9.-]+)?$/.test(tag)) return null;
    return url.href;
  } catch {
    return null;
  }
}
function formatCheckedAt(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function normalizeUpdateState(value) {
  if (!value || typeof value !== "object" || !version(value.currentVersion) || !STATUSES.has(value.status)) throw invalid2();
  if (value.latestVersion !== null && (!version(value.latestVersion) || !/^v?\d+\.\d+\.\d+(?:\+[a-zA-Z0-9.-]+)?$/.test(value.latestVersion))) throw invalid2();
  if (value.checkedAt !== null && formatCheckedAt(value.checkedAt) === null) throw invalid2();
  if (value.error !== null && !ERRORS.has(value.error)) throw invalid2();
  if (value.status === "error" !== (value.error !== null)) throw invalid2();
  if (["current", "update-available", "ahead"].includes(value.status) && (!value.latestVersion || value.checkedAt === null)) throw invalid2();
  return Object.freeze({
    currentVersion: value.currentVersion,
    status: value.status,
    latestVersion: value.latestVersion,
    releaseUrl: safeReleaseUrl(value.releaseUrl),
    checkedAt: value.checkedAt,
    error: value.error,
    installSpec: INSTALL_SPEC
  });
}
function initialUpdateSnapshot() {
  return { data: null, pending: "load", localError: null, cancelled: false };
}
function updateDisplay(snapshot) {
  const error = snapshot.localError ?? (snapshot.data?.status === "error" ? snapshot.data.error : null);
  const status = snapshot.pending === "check" ? "checking" : snapshot.pending === "load" ? "loading" : snapshot.cancelled ? "cancelled" : error ? "error" : snapshot.data?.status ?? "idle";
  return {
    status,
    error,
    message: "updates." + status,
    releaseUrl: safeReleaseUrl(snapshot.data?.releaseUrl),
    checkedAt: formatCheckedAt(snapshot.data?.checkedAt)
  };
}
function createUpdateController(fetcher = globalThis.fetch) {
  let state = initialUpdateSnapshot();
  let disposed = true;
  let epoch = 0;
  let flight = null;
  const listeners2 = /* @__PURE__ */ new Set();
  const publish = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners2) listener();
  };
  const invalidate = () => {
    epoch += 1;
    flight?.abort();
    flight = null;
  };
  async function request(method) {
    if (disposed || method === "POST" && state.pending === "check") return false;
    invalidate();
    const revision = epoch;
    const abort = new AbortController();
    flight = abort;
    publish({ pending: method === "POST" ? "check" : "load", localError: null, cancelled: false });
    try {
      const response = await fetcher(UPDATE_ENDPOINT, {
        method,
        credentials: "same-origin",
        signal: abort.signal,
        ...method === "POST" ? { headers: { "Content-Type": "application/json" }, body: "{}" } : {}
      });
      let body;
      try {
        body = await response.json();
      } catch {
        throw invalid2();
      }
      const data = normalizeUpdateState(body);
      if (!response.ok && data.status !== "error") throw invalid2();
      if (disposed || abort.signal.aborted || epoch !== revision) return false;
      publish({ data, localError: null });
      return true;
    } catch (error) {
      if (disposed || abort.signal.aborted || epoch !== revision) return false;
      const code2 = ERRORS.has(error?.code) ? error.code : error?.name === "TimeoutError" ? "timeout" : "network";
      publish({ localError: code2 });
      return false;
    } finally {
      if (!disposed && epoch === revision) {
        flight = null;
        publish({ pending: null });
      }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners2.add(listener);
      return () => listeners2.delete(listener);
    },
    start() {
      disposed = false;
      return request("GET");
    },
    load() {
      return request("GET");
    },
    check() {
      return request("POST");
    },
    cancel() {
      if (!disposed) {
        invalidate();
        publish({ pending: null, cancelled: true, localError: null });
      }
    },
    dispose() {
      disposed = true;
      invalidate();
    }
  };
}
async function copyInstallSpec(clipboard = globalThis.navigator?.clipboard) {
  if (typeof clipboard?.writeText !== "function") throw new Error("clipboard-unavailable");
  await clipboard.writeText(INSTALL_SPEC);
}
var UPDATE_ENDPOINT, INSTALL_SPEC, STATUSES, ERRORS, VERSION, version, invalid2;
var init_update_state = __esm({
  "assist/client/update-state.js"() {
    UPDATE_ENDPOINT = "/api/local-openai-fast.updates";
    INSTALL_SPEC = "github:Syngnat/dsh-prompt-assist";
    STATUSES = /* @__PURE__ */ new Set(["idle", "current", "update-available", "ahead", "error"]);
    ERRORS = /* @__PURE__ */ new Set(["network", "timeout", "rate-limited", "not-found", "invalid-response"]);
    VERSION = /^v?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/;
    version = (value) => typeof value === "string" && value.length <= 80 && VERSION.test(value);
    invalid2 = () => Object.assign(new Error("invalid-response"), { code: "invalid-response" });
  }
});

// assist/client/online-update-state.js
function normalizeOnlineOperation(x) {
  if (!object(x) || !id(x.jobId) || !version2(x.fromVersion) || !version2(x.targetVersion) || !ONLINE_PHASES.includes(x.phase) || typeof x.terminal !== "boolean" || x.phase !== "unknown" && x.terminal !== TERMINAL.has(x.phase) || !(x.installedVersion === null || version2(x.installedVersion)) || !nullableCode(x.error) || !nullableCode(x.detailCode) || typeof x.restartRequired !== "boolean" || typeof x.cancelRequested !== "boolean") throw invalid3();
  if (x.phase === "updated" && (x.installedVersion !== x.targetVersion || x.restartRequired || x.error !== null)) throw invalid3();
  if (x.phase === "restart-required" && !x.restartRequired) throw invalid3();
  return Object.freeze(Object.fromEntries(["jobId", "fromVersion", "targetVersion", "phase", "terminal", "installedVersion", "error", "detailCode", "restartRequired", "cancelRequested"].map((key) => [key, x[key]])));
}
function normalizeOnlineStatus(x) {
  if (!object(x) || !version2(x.currentVersion) || typeof x.available !== "boolean" || !nullableCode(x.reason)) throw invalid3();
  return Object.freeze({
    currentVersion: x.currentVersion,
    available: x.available,
    reason: x.reason,
    operation: x.operation === null ? null : normalizeOnlineOperation(x.operation)
  });
}
function normalizeOnlinePreparation(x, now = Date.now()) {
  if (!object(x) || typeof x.token !== "string" || !/^[A-Za-z0-9_-]{16,512}$/.test(x.token) || !version2(x.fromVersion) || !version2(x.targetVersion) || !pinnedSpec(x.targetSpec) || !pinnedSpec(x.restoreSpec) || !Number.isSafeInteger(x.expiresAt) || x.expiresAt <= now || x.expiresAt > 864e13) throw invalid3();
  return Object.freeze(Object.fromEntries(["token", "fromVersion", "targetVersion", "targetSpec", "restoreSpec", "expiresAt"].map((key) => [key, x[key]])));
}
function readMarker(storage) {
  try {
    const x = JSON.parse(storage?.getItem(ONLINE_MARKER_KEY) ?? "null");
    if (!object(x) || !version2(x.fromVersion) || !version2(x.targetVersion) || !(x.jobId === null || id(x.jobId))) return null;
    return { fromVersion: x.fromVersion, targetVersion: x.targetVersion, jobId: x.jobId };
  } catch {
    return null;
  }
}
function createOnlineUpdateController(fetcher = globalThis.fetch, { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, pollMs = 3e3, storage = browserStorage() } = {}) {
  let state = initialOnlineSnapshot(), disposed = true, epoch = 0, timer = null, flight = null;
  let submitted = null, marker = readMarker(storage);
  if (marker) state = { ...state, uncertain: true };
  const saveMarker = (next) => {
    marker = next;
    try {
      if (next) storage?.setItem(ONLINE_MARKER_KEY, JSON.stringify(next));
      else storage?.removeItem(ONLINE_MARKER_KEY);
    } catch {
    }
  };
  const associateMarker = (operation) => {
    if (!marker) return true;
    if (!operation || operation.fromVersion !== marker.fromVersion || operation.targetVersion !== marker.targetVersion || (marker.jobId ? operation.jobId !== marker.jobId : operation.terminal)) return false;
    saveMarker(operation.terminal ? null : { fromVersion: operation.fromVersion, targetVersion: operation.targetVersion, jobId: operation.jobId });
    return true;
  };
  const listeners2 = /* @__PURE__ */ new Set();
  const publish = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners2) listener();
  };
  const clearPoll = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const schedule = () => {
    clearPoll();
    if (!disposed && (state.data?.reason === "busy" || state.data?.operation && !state.data.operation.terminal))
      timer = setTimer(() => {
        timer = null;
        void request("load");
      }, Math.max(3e3, pollMs));
  };
  async function request(action) {
    if (disposed || state.pending) return false;
    if (action === "prepare" && (!state.data?.available || state.uncertain || state.data.operation && !state.data.operation.terminal)) return false;
    let body, rejectedBeforeSubmission = false;
    if (action === "confirm") {
      const p = state.preparation;
      if (!p || !state.consent || state.uncertain) return false;
      if (p.expiresAt <= now()) {
        publish({ preparation: null, consent: false, localError: "confirmation-expired" });
        return false;
      }
      submitted = { fromVersion: p.fromVersion, targetVersion: p.targetVersion, previousJobId: state.data?.operation?.jobId };
      saveMarker({ fromVersion: p.fromVersion, targetVersion: p.targetVersion, jobId: null });
      body = { action: "confirm", token: p.token, targetVersion: p.targetVersion, consent: true };
    } else if (action === "prepare") body = { action: "prepare" };
    clearPoll();
    const revision = ++epoch, abort = new AbortController();
    flight = abort;
    publish({ pending: action, localError: null, confirmationRejected: false, recoveryAcknowledged: false, markerCleared: false, ...action === "load" ? {} : { preparation: null, consent: false } });
    try {
      const response = await fetcher(ONLINE_UPDATE_ENDPOINT, {
        method: body ? "POST" : "GET",
        credentials: "same-origin",
        signal: abort.signal,
        ...body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}
      });
      let value;
      try {
        value = await response.json();
      } catch {
        throw invalid3();
      }
      if (!response.ok) {
        rejectedBeforeSubmission = response.ok === false && action === "confirm" && object(value) && Object.keys(value).length === 1 && PRE_SUBMISSION_REJECTIONS.has(value.error);
        throw Object.assign(new Error("request-failed"), { code: object(value) && code(value.error) ? value.error : "invalid-response" });
      }
      const data = action === "load" ? normalizeOnlineStatus(value) : action === "prepare" ? normalizeOnlinePreparation(value, now()) : normalizeOnlineOperation(value);
      if (disposed || revision !== epoch) return false;
      if (action === "confirm" && (data.targetVersion !== submitted.targetVersion || data.fromVersion !== submitted.fromVersion || data.jobId === submitted.previousJobId)) throw invalid3();
      if (action === "load") {
        const lost = !data.operation && (state.uncertain || !!state.data?.operation || state.recordLost);
        const unresolved = state.uncertain && submitted && (!data.operation || data.operation.jobId === submitted.previousJobId || data.operation.targetVersion !== submitted.targetVersion || data.operation.fromVersion !== submitted.fromVersion) || !associateMarker(data.operation);
        publish({ data, recordLost: lost, uncertain: lost || !!unresolved, ...data.operation ? { preparation: null, consent: false } : {} });
      } else if (action === "prepare") publish({ preparation: data });
      else {
        saveMarker(data.terminal ? null : { fromVersion: data.fromVersion, targetVersion: data.targetVersion, jobId: data.jobId });
        publish({ data: { ...state.data, operation: data }, uncertain: false, recordLost: false });
      }
      return true;
    } catch (error) {
      if (disposed || revision !== epoch) return false;
      if (rejectedBeforeSubmission) {
        saveMarker(null);
        submitted = null;
      }
      publish({ localError: code(error?.code) ? error.code : "network", ...action === "confirm" ? {
        uncertain: !rejectedBeforeSubmission,
        recordLost: false,
        confirmationRejected: rejectedBeforeSubmission
      } : {} });
      return false;
    } finally {
      if (!disposed && revision === epoch) {
        flight = null;
        publish({ pending: null });
        schedule();
      }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners2.add(listener);
      return () => listeners2.delete(listener);
    },
    start() {
      disposed = false;
      return request("load");
    },
    load: () => request("load"),
    prepare: () => request("prepare"),
    confirm: () => request("confirm"),
    setConsent(consent) {
      if (!disposed && !state.pending && state.preparation) publish({ consent: consent === true });
    },
    dismiss() {
      if (!disposed && !state.pending) publish({ preparation: null, consent: false });
    },
    setRecoveryAcknowledged(value) {
      if (!disposed && canForgetOnlineMarker(state)) publish({ recoveryAcknowledged: value === true });
    },
    forgetMarker() {
      if (disposed || !canForgetOnlineMarker(state) || state.recoveryAcknowledged !== true) return false;
      clearPoll();
      saveMarker(null);
      submitted = null;
      publish({ ...initialOnlineSnapshot(), markerCleared: true });
      return true;
    },
    dispose() {
      disposed = true;
      epoch += 1;
      clearPoll();
      flight?.abort();
      flight = null;
      state = { ...state, preparation: null, consent: false, recoveryAcknowledged: false, pending: null };
    }
  };
}
var ONLINE_UPDATE_ENDPOINT, ONLINE_PHASES, TERMINAL, PRE_SUBMISSION_REJECTIONS, invalid3, object, version2, code, nullableCode, id, pinnedSpec, ONLINE_MARKER_KEY, browserStorage, initialOnlineSnapshot, canForgetOnlineMarker;
var init_online_update_state = __esm({
  "assist/client/online-update-state.js"() {
    ONLINE_UPDATE_ENDPOINT = "/api/local-openai-fast.online-update";
    ONLINE_PHASES = Object.freeze(["queued", "checking", "removing", "installing", "activating", "verifying", "recovering", "updated", "restart-required", "restored", "repair-required", "failed", "cancelled", "unknown"]);
    TERMINAL = /* @__PURE__ */ new Set(["updated", "restart-required", "restored", "repair-required", "failed", "cancelled", "unknown"]);
    PRE_SUBMISSION_REJECTIONS = /* @__PURE__ */ new Set(["confirmation-expired", "confirmation-required", "inventory-changed", "busy", "invalid-request", "owner-confirmation-required", "unavailable"]);
    invalid3 = () => Object.assign(new Error("invalid-response"), { code: "invalid-response" });
    object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
    version2 = (x) => typeof x === "string" && x.length <= 80 && /^v?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/.test(x);
    code = (x) => typeof x === "string" && /^[a-z][a-z0-9-]{0,79}$/.test(x);
    nullableCode = (x) => x === null || code(x);
    id = (x) => typeof x === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(x);
    pinnedSpec = (x) => typeof x === "string" && /^github:Syngnat\/dsh-prompt-assist#[a-fA-F0-9]{40}$/.test(x);
    ONLINE_MARKER_KEY = "local-prompt-assist.online-update.pending.v1";
    browserStorage = () => {
      try {
        return globalThis.sessionStorage;
      } catch {
        return null;
      }
    };
    initialOnlineSnapshot = () => ({ data: null, preparation: null, consent: false, pending: null, localError: null, uncertain: false, recordLost: false, confirmationRejected: false, recoveryAcknowledged: false, markerCleared: false });
    canForgetOnlineMarker = (state) => !!((state.uncertain || state.recordLost) && state.data && !state.pending && !state.localError && state.data.reason !== "busy" && (!state.data.operation || state.data.operation.terminal));
  }
});

// assist/client/online-update-panel.js
function OnlineUpdatePanelContent({ snapshot = initialOnlineSnapshot(), updateAvailable = false, t, onPrepare, onConfirm, onConsent, onDismiss, onReload, onRecoveryAcknowledged, onForgetMarker }) {
  const { data, preparation, pending, consent, localError, uncertain, recordLost, confirmationRejected, recoveryAcknowledged, markerCleared } = snapshot;
  const operation = data?.operation;
  const canForget = canForgetOnlineMarker(snapshot);
  const active = operation && !operation.terminal;
  const button = (key, onClick, disabled = false, emphasis = "") => h6("button", { type: "button", className: "lpa-button" + emphasis, onClick, disabled }, t("online." + key));
  const field = (label, value) => h6("div", { className: "lpa-update-field", key: label }, h6("dt", null, t("online." + label)), h6("dd", null, value));
  return h6(
    "section",
    { className: "lpa-update-panel", "aria-label": t("online.title"), "aria-busy": !!pending },
    h6("h3", null, t("online.title")),
    updateAvailable && data?.available && !active && !pending && !uncertain && !recordLost && operation?.phase !== "unknown" ? h6(
      "div",
      { className: "lpa-update-banner", role: "status", "aria-live": "polite", "aria-atomic": true },
      h6("span", { className: "lpa-update-badge" }, t("online.badge")),
      h6("div", { className: "lpa-update-banner-copy" }, h6("h4", null, t("online.availableTitle")), h6("p", null, t("online.availableHint")))
    ) : null,
    h6("p", { className: "lpa-note" }, t("online.userOnly")),
    h6("p", { className: "lpa-note" }, t("online.continuity")),
    operation && !uncertain ? h6(
      "div",
      { role: "status", "aria-live": "polite", "aria-atomic": true },
      h6("p", null, t("online.phase." + operation.phase)),
      h6(
        "dl",
        { className: "lpa-update-versions" },
        field("jobId", operation.jobId),
        field("fromVersion", operation.fromVersion),
        field("targetVersion", operation.targetVersion),
        field("installedVersion", operation.installedVersion ?? t("updates.unknown"))
      ),
      operation.error ? h6("p", { className: "lpa-error" }, t("online.errorCode"), " ", h6("code", null, operation.error)) : null,
      operation.detailCode ? h6("p", { className: "lpa-note" }, t("online.detailCode"), " ", h6("code", null, operation.detailCode)) : null,
      operation.restartRequired ? h6("p", { className: "lpa-note" }, t("online.restart")) : null,
      operation.cancelRequested ? h6("p", { className: "lpa-note" }, t("online.cancelRequested")) : null
    ) : null,
    !data && !localError && !markerCleared ? h6("p", { role: "status" }, t("online.loading")) : null,
    data && !operation && !uncertain ? h6("p", { className: "lpa-note" }, t("online.noRecord")) : null,
    data && !data.available ? h6("p", { className: "lpa-note" }, t("online.unavailable"), data.reason ? " (" + data.reason + ")" : null) : null,
    recordLost || uncertain ? h6("p", { className: "lpa-error", role: "alert" }, t(recordLost ? "online.recordLost" : "online.uncertain")) : null,
    localError ? h6("p", { className: "lpa-error", role: "alert" }, t(confirmationRejected ? "online.confirmationRejected" : "online.requestFailed"), " ", h6("code", null, localError)) : null,
    recordLost || uncertain ? h6(
      "div",
      { className: "lpa-update-install" },
      h6("p", { className: "lpa-note" }, t("online.forgetWarning")),
      h6("label", { className: "lpa-row" }, h6("input", {
        type: "checkbox",
        checked: recoveryAcknowledged === true,
        disabled: !canForget,
        onChange: (event) => onRecoveryAcknowledged?.(event.target.checked)
      }), t("online.forgetAcknowledgement")),
      button("forgetMarker", onForgetMarker, !canForget || recoveryAcknowledged !== true)
    ) : null,
    markerCleared ? h6("p", { className: "lpa-note", role: "status" }, t("online.markerCleared")) : null,
    preparation ? h6(
      "div",
      { className: "lpa-update-review" },
      h6("h4", null, t("online.review")),
      h6(
        "dl",
        { className: "lpa-update-versions" },
        field("fromVersion", preparation.fromVersion),
        field("targetVersion", preparation.targetVersion),
        field("targetSpec", h6("code", null, preparation.targetSpec)),
        field("restoreSpec", h6("code", null, preparation.restoreSpec)),
        field("expiresAt", h6("time", { dateTime: new Date(preparation.expiresAt).toISOString() }, new Date(preparation.expiresAt).toISOString()))
      ),
      h6("p", { className: "lpa-update-risk" }, t("online.risks")),
      h6(
        "fieldset",
        { className: "lpa-update-consent" },
        h6("legend", null, t("online.consentTitle")),
        h6("label", { className: "lpa-row" }, h6("input", { type: "checkbox", checked: consent, disabled: !!pending, onChange: (event) => onConsent?.(event.target.checked) }), t("online.consent"))
      ),
      h6("div", { className: "lpa-row" }, button("confirm", onConfirm, !consent || !!pending || uncertain, " lpa-button--primary lpa-button--danger"), button("dismiss", onDismiss, !!pending))
    ) : null,
    h6(
      "div",
      { className: "lpa-row" },
      !preparation && updateAvailable ? button(pending === "prepare" ? "preparing" : "prepare", onPrepare, !!pending || !data?.available || !!active || uncertain, " lpa-button--primary") : null,
      button("reload", onReload, !!pending)
    ),
    pending === "confirm" ? h6("p", { role: "status" }, t("online.submitting")) : null
  );
}
function OnlineUpdatePanel({ t, updateAvailable, fetcher = globalThis.fetch }) {
  const controller = import_react7.default.useMemo(() => createOnlineUpdateController(fetcher), [fetcher]);
  const snapshot = import_react7.default.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  import_react7.default.useEffect(() => {
    void controller.start();
    return () => controller.dispose();
  }, [controller]);
  return h6(OnlineUpdatePanelContent, {
    t,
    snapshot,
    updateAvailable,
    onPrepare: () => {
      void controller.prepare();
    },
    onConfirm: () => {
      void controller.confirm();
    },
    onRecoveryAcknowledged: (value) => controller.setRecoveryAcknowledged(value),
    onForgetMarker: () => controller.forgetMarker(),
    onConsent: (value) => controller.setConsent(value),
    onDismiss: () => controller.dismiss(),
    onReload: () => {
      void controller.load();
    }
  });
}
var import_react7, h6;
var init_online_update_panel = __esm({
  "assist/client/online-update-panel.js"() {
    import_react7 = __toESM(require("react"), 1);
    init_online_update_state();
    h6 = import_react7.default.createElement;
  }
});

// assist/client/update-panel.js
function UpdatePanelContent({ snapshot = initialUpdateSnapshot(), t, onCheck, onReload, onCancel, onCopy, copyStatus, children }) {
  const view = updateDisplay(snapshot);
  const data = snapshot.data;
  const available = view.status === "update-available";
  const button = (key, onClick, disabled = false) => h7("button", { type: "button", className: "lpa-button", onClick, disabled }, t(key));
  const field = (label, value, highlight = false) => h7(
    "div",
    { className: "lpa-update-field" + (highlight ? " lpa-update-field--highlight" : ""), key: label },
    h7("dt", null, t(label)),
    h7("dd", null, value)
  );
  return h7(
    "section",
    { className: "lpa-update-panel", "aria-label": t("updates.title") },
    h7("h2", { className: "lpa-update-title" }, t("updates.title")),
    h7("p", { className: "lpa-note" }, t("updates.readOnly")),
    h7(
      "dl",
      { className: "lpa-update-versions" },
      field("updates.installedVersion", data?.currentVersion ?? t("updates.unknown")),
      field("updates.latestVersion", data?.latestVersion ?? t("updates.unknown"), available),
      field("updates.checkedAt", view.checkedAt ? h7("time", { dateTime: view.checkedAt }, view.checkedAt) : t("updates.notChecked"))
    ),
    available ? h7(
      "div",
      { className: "lpa-update-summary lpa-update-summary--available", role: "status", "aria-live": "polite", "aria-atomic": true },
      h7("strong", null, t("updates.availableTitle")),
      h7("p", null, t(view.message)),
      h7("p", null, t("updates.availableHint"))
    ) : h7(
      "p",
      {
        className: view.status === "error" ? "lpa-error" : "lpa-note",
        role: view.status === "error" ? "alert" : "status",
        "aria-live": "polite",
        "aria-atomic": true
      },
      t(view.message),
      view.status === "error" && view.error ? " " + t("updates.error." + view.error) : null
    ),
    h7(
      "div",
      { className: "lpa-row" },
      button(snapshot.pending === "check" ? "updates.checkingButton" : "updates.checkButton", onCheck, snapshot.pending === "check"),
      snapshot.pending ? button("updates.cancel", onCancel) : null,
      snapshot.localError ? button("updates.reloadStatus", onReload) : null,
      view.releaseUrl ? h7("a", { className: "lpa-button", href: view.releaseUrl, target: "_blank", rel: "noopener noreferrer" }, t("updates.releaseLink")) : null
    ),
    h7("p", { className: "lpa-note" }, t("updates.privacy")),
    h7("p", { className: "lpa-note" }, t("updates.cacheNote")),
    children,
    h7(
      "div",
      { className: "lpa-update-install" },
      h7("span", null, t("updates.installAddress")),
      h7("code", null, INSTALL_SPEC),
      button("updates.copy", onCopy),
      copyStatus ? h7("span", { className: "lpa-note", role: "status" }, t("updates." + copyStatus)) : null
    ),
    h7(
      "details",
      { className: "lpa-update-guide" },
      h7("summary", null, t("updates.manualUpgrade")),
      h7(
        "ol",
        null,
        h7("li", null, t("updates.stepSave")),
        h7("li", null, t("updates.stepRemove"), " ", h7("code", null, "@local/dsh-openai-fast")),
        h7("li", null, t("updates.stepInstall"), " ", h7("code", null, INSTALL_SPEC)),
        h7("li", null, t("updates.stepRestart"))
      ),
      h7("p", { className: "lpa-note" }, t("updates.backup"))
    )
  );
}
function UpdatePanel({ t, fetcher = globalThis.fetch }) {
  const controller = import_react8.default.useMemo(() => createUpdateController(fetcher), [fetcher]);
  const snapshot = import_react8.default.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [copyStatus, setCopyStatus] = import_react8.default.useState(null);
  const copyEpoch = import_react8.default.useRef(0);
  import_react8.default.useEffect(() => {
    void controller.start();
    return () => {
      copyEpoch.current += 1;
      controller.dispose();
    };
  }, [controller]);
  async function copy() {
    const revision = ++copyEpoch.current;
    try {
      await copyInstallSpec();
      if (copyEpoch.current === revision) setCopyStatus("copied");
    } catch {
      if (copyEpoch.current === revision) setCopyStatus("copyFailed");
    }
  }
  return h7(
    UpdatePanelContent,
    {
      snapshot,
      t,
      copyStatus,
      onCopy: copy,
      onCheck: () => {
        void controller.check();
      },
      onReload: () => {
        void controller.load();
      },
      onCancel: () => controller.cancel()
    },
    h7(OnlineUpdatePanel, { t, fetcher, updateAvailable: snapshot.data?.status === "update-available" })
  );
}
var import_react8, h7;
var init_update_panel = __esm({
  "assist/client/update-panel.js"() {
    import_react8 = __toESM(require("react"), 1);
    init_update_state();
    init_online_update_panel();
    h7 = import_react8.default.createElement;
  }
});

// assist/client/settings.js
function Settings(p) {
  const { t, config: v, catalog: c, capabilities: cap } = p;
  const change = (patch) => p.onChange({ ...v, ...patch });
  const field = (key, node) => h8("label", { className: "lpa-field" }, t(key), node);
  const check = (key, checked, change2, disabled = false) => h8("label", { className: "lpa-check" }, h8("input", { type: "checkbox", checked, disabled, onChange: (e) => change2(e.target.checked) }), t(key));
  const [custom, setCustom] = import_react9.default.useState(![1, 3, 5].includes(v.rounds));
  const [error, setError] = import_react9.default.useState(null);
  const efforts = cap?.efforts ?? [];
  const invalidEffort = !v.followSession && cap && v.reasoningEffort && !efforts.some((e) => e.id === v.reasoningEffort);
  const invalidFast = cap && v.fast && !cap.fastEligible;
  const submit = (e) => {
    e.preventDefault();
    const problem = validateSettings(v);
    setError(problem === "rounds" ? "roundsError" : problem ? "modelError" : null);
    if (!problem && !invalidEffort) p.save(sessionSettings(v));
  };
  const select = (key, value, items, change2) => field(key, h8("select", { value, onChange: (e) => change2(e.target.value) }, items.map((item) => h8("option", { key: item.id, value: item.id }, item.name))));
  return h8(
    "form",
    { onSubmit: submit },
    h8("div", { className: "lpa-row" }, check("follow", v.followSession, (followSession) => change({ followSession }))),
    h8("p", { className: "lpa-note" }, t("followHint")),
    h8("p", { className: "lpa-note" }, t("budgetPolicy")),
    !v.followSession ? h8(
      "div",
      { className: "lpa-grid" },
      select("provider", v.provider, [{ id: "", name: t("selectProvider") }, ...c.providers], (provider) => change({ provider, model: "" })),
      select("model", v.model, [{ id: "", name: t("selectModel") }, ...c.models.filter((m) => m.provider === v.provider)], (model) => change({ model })),
      select("effort", v.reasoningEffort, [{ id: "", name: t("nativeDefault") }, ...invalidEffort ? [{ id: v.reasoningEffort, name: v.reasoningEffort }] : [], ...efforts], (reasoningEffort) => change({ reasoningEffort }))
    ) : null,
    invalidEffort ? h8("p", { className: "lpa-error", role: "alert" }, t("effortInvalid")) : null,
    check("fast", v.fast, (fast2) => change({ fast: fast2 }), !v.fast && cap?.fastEligible !== true),
    invalidFast ? h8("p", { className: "lpa-note", role: "status" }, t("fastSkipped")) : null,
    h8(
      "div",
      { className: "lpa-grid" },
      select("rounds", custom ? "custom" : String(v.rounds), [1, 3, 5].map((n) => ({ id: String(n), name: n })).concat({ id: "custom", name: t("custom") }), (value) => {
        setCustom(value === "custom");
        if (value !== "custom") change({ rounds: Number(value) });
      }),
      custom ? field("custom", h8("input", { type: "number", min: 1, max: 20, step: 1, value: Number.isFinite(v.rounds) ? v.rounds : "", onChange: (e) => change({ rounds: e.target.value === "" ? NaN : Number(e.target.value) }) })) : null
    ),
    error ? h8("p", { role: "alert", className: "lpa-error" }, t(error)) : null,
    h8("button", { className: "lpa-button lpa-button--primary", type: "submit", disabled: p.saving || !p.allowed }, t(p.saving ? "saving" : "save"))
  );
}
var import_react9, h8;
var init_settings = __esm({
  "assist/client/settings.js"() {
    import_react9 = __toESM(require("react"), 1);
    init_api();
    h8 = import_react9.default.createElement;
  }
});

// assist/client/enablement-panel.js
function EnablementPanelContent({ snapshot, t, onSet, onReload }) {
  const { data, connected, loading, pending, readError, writeError, saved } = snapshot;
  const disabled = !data || !connected || !!pending;
  const message = writeError === "stale-enablement" ? "global.stale" : writeError ? "global.saveFailed" : readError ? "global.disconnected" : null;
  return h9(
    "section",
    { className: "lpa-feature", "aria-label": t("global.title"), "aria-busy": !!pending },
    h9("h2", { className: "lpa-feature-title" }, t("global.title")),
    h9("p", { className: "lpa-note" }, t("global.scope")),
    h9("p", { className: "lpa-note" }, t("global.charge")),
    h9("div", { className: "lpa-row" }, ["suggest", "enhance"].map((feature) => h9(
      "label",
      { className: "lpa-check", key: feature },
      h9("input", { type: "checkbox", checked: data?.enabled[feature] === true, disabled, onChange: (event) => onSet(feature, event.target.checked) }),
      t("global." + feature)
    ))),
    h9("p", { className: "lpa-note" }, t("global.migration")),
    pending ? h9("p", { role: "status" }, t("global.saving")) : null,
    !connected && !message ? h9("p", { role: "status", className: "lpa-note" }, t(loading ? "global.loading" : "global.disconnected")) : null,
    message ? h9("p", { role: "alert", className: "lpa-error" }, t(message)) : null,
    saved && connected && saved.revision === data?.revision && !writeError ? h9("p", { role: "status", className: "lpa-note" }, t("global.saved")) : null,
    !connected || readError || writeError ? h9("button", { type: "button", className: "lpa-button", onClick: onReload, disabled: !!pending || loading }, t("global.reload")) : null
  );
}
function EnablementPanel({ globalSource = EMPTY_ENABLEMENT_SOURCE, t }) {
  const snapshot = import_react10.default.useSyncExternalStore(globalSource.subscribe, globalSource.getSnapshot, globalSource.getSnapshot);
  return h9(EnablementPanelContent, { snapshot, t, onSet: (feature, value) => {
    void globalSource.setEnabled(feature, value);
  }, onReload: () => {
    void globalSource.load();
  } });
}
var import_react10, h9;
var init_enablement_panel = __esm({
  "assist/client/enablement-panel.js"() {
    import_react10 = __toESM(require("react"), 1);
    init_enablement_source();
    h9 = import_react10.default.createElement;
  }
});

// assist/client/priority-panel.js
function availableCandidates(candidates, state) {
  const excluded = /* @__PURE__ */ new Set([...providerIds(state?.configured), ...providerIds(state?.authorized)]);
  const seen = /* @__PURE__ */ new Set();
  return (Array.isArray(candidates) ? candidates : []).flatMap((item) => {
    if (!item || typeof item.id !== "string" || !PROVIDER.test(item.id) || item.configured !== false || excluded.has(item.id) || seen.has(item.id) || !Array.isArray(item.openAIModels)) return [];
    const openAIModels = item.openAIModels.filter((model) => typeof model === "string" && isOpenAIModel(model)).slice(0, 8);
    if (!openAIModels.length) return [];
    seen.add(item.id);
    return [{ id: item.id, configured: false, name: typeof item.name === "string" ? item.name : item.id, openAIModels }];
  });
}
function PriorityPanelContent({
  state,
  candidates = [],
  consent = false,
  notice,
  pending,
  t,
  onConsent,
  onAuthorize,
  onRevoke,
  onReload,
  selected = "",
  onSelect
}) {
  const configured = providerIds(state?.configured);
  const authorized = providerIds(state?.authorized).filter((id2) => !configured.includes(id2));
  const available = availableCandidates(candidates, state);
  const selection = available.find((item) => item.id === selected);
  const raw = Array.isArray(candidates) ? candidates : [];
  const builtinModels = new Map(raw.filter((item) => item && item.configured === true && Array.isArray(item.openAIModels)).map((item) => [item.id, item.openAIModels.filter((model) => typeof model === "string" && isOpenAIModel(model)).slice(0, 8)]));
  const button = (key, action, disabled = false, extra = {}) => h10(
    "button",
    { type: "button", className: "lpa-button", onClick: action, disabled, ...extra },
    t(key)
  );
  return h10(
    "section",
    { className: "lpa-feature", "aria-label": t("priority.title"), "aria-busy": Boolean(pending) },
    h10("h3", { className: "lpa-feature-title" }, t("priority.title")),
    h10("p", { className: "lpa-note" }, t("priority.scope")),
    h10(
      "div",
      { className: "lpa-field" },
      h10("strong", null, t("priority.configured")),
      configured.map((id2) => h10(
        "p",
        { className: "lpa-note", key: id2 },
        h10("code", null, id2),
        builtinModels.get(id2)?.length ? " \xB7 " + t("priority.visibleModels") + ": " + builtinModels.get(id2).join(", ") : null
      ))
    ),
    h10(
      "div",
      { className: "lpa-field" },
      h10("strong", null, t("priority.authorized")),
      authorized.map((id2) => h10(
        "div",
        { className: "lpa-row", key: id2 },
        h10("code", null, id2),
        button("priority.revoke", () => onRevoke?.(id2), !state || Boolean(pending), { "aria-label": t("priority.revoke") + ": " + id2 })
      )),
      state && !authorized.length ? h10("p", { className: "lpa-note" }, t("priority.none")) : null
    ),
    available.length ? h10(
      "label",
      { className: "lpa-field" },
      t("priority.candidates"),
      h10(
        "select",
        {
          value: selection?.id ?? "",
          disabled: !state || Boolean(pending),
          onChange: (event) => onSelect?.(event.target.value)
        },
        h10("option", { value: "" }, t("priority.choose")),
        available.map((item) => h10("option", { key: item.id, value: item.id }, item.name + " (" + item.id + ")"))
      )
    ) : null,
    state && !available.length ? h10("p", { className: "lpa-note" }, t(raw.length ? "priority.allAuthorized" : "priority.noProviderModels")) : null,
    selection ? h10("p", { className: "lpa-note" }, t("priority.exampleModels"), ": ", selection.openAIModels.join(", ")) : null,
    h10("label", { className: "lpa-check" }, h10("input", {
      type: "checkbox",
      checked: consent === true,
      disabled: !state || Boolean(pending),
      onChange: (event) => onConsent?.(event.target.checked)
    }), t("priority.consent")),
    h10(
      "div",
      { className: "lpa-row" },
      button("priority.authorize", () => onAuthorize?.(selected, consent), !state || Boolean(pending) || consent !== true || !selection),
      button("priority.reload", () => onReload?.(), Boolean(pending))
    ),
    pending || !state && !notice ? h10("p", { className: "lpa-note", role: "status" }, t("priority.loading")) : null,
    notice ? h10("p", { className: notice === "priority.error" ? "lpa-error" : "lpa-note", role: "status" }, t(notice)) : null
  );
}
function readState(value) {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0) throw { code: "invalid-response" };
  for (const key of ["configured", "authorized", "effective"]) {
    if (!Array.isArray(value[key]) || value[key].some((id2) => typeof id2 !== "string" || !PROVIDER.test(id2))) throw { code: "invalid-response" };
  }
  return Object.freeze({
    revision: value.revision,
    configured: Object.freeze([...value.configured]),
    authorized: Object.freeze([...value.authorized]),
    effective: Object.freeze([...value.effective])
  });
}
function createPriorityController(connection, { onChanged } = {}) {
  let snapshot = { state: null, candidates: [], pending: null, notice: null };
  let active = false, epoch = 0, flight = null;
  const listeners2 = /* @__PURE__ */ new Set();
  const publish = (patch) => {
    snapshot = { ...snapshot, ...patch };
    listeners2.forEach((listener) => listener());
  };
  const stop = () => {
    epoch += 1;
    flight?.abort();
    flight = null;
  };
  async function rpc(payload, signal) {
    const result = await connection.rpc.call(ASSIST_CHANNEL, ENDPOINT, payload, signal);
    if (signal.aborted) throw { code: "cancelled" };
    if (result?.ok !== true) throw { code: result?.error?.code };
    return result.value;
  }
  async function read(signal) {
    readState(await rpc({ action: "snapshot" }, signal));
    const value = await rpc({ action: "candidates" }, signal);
    const state = readState(value);
    if (!Array.isArray(value.candidates)) throw { code: "invalid-response" };
    return { state, candidates: value.candidates };
  }
  async function run(action, input = {}) {
    if (!active || snapshot.pending) return false;
    stop();
    const token = epoch, abort = new AbortController();
    flight = abort;
    const valid = () => active && epoch === token && !abort.signal.aborted;
    publish({ pending: action, notice: null });
    try {
      if (action === "load") {
        const loaded = await read(abort.signal);
        if (!valid()) return false;
        publish({ ...loaded, notice: null });
      } else {
        const value = await rpc({ action, ...input }, abort.signal);
        const state = readState(value);
        if (!valid()) return false;
        publish({ state, notice: "priority.saved" });
        try {
          notifyPriorityChanged();
        } catch {
        }
        if (valid()) {
          try {
            Promise.resolve(onChanged?.()).catch(() => {
            });
          } catch {
          }
        }
      }
      return true;
    } catch (error) {
      if (!valid()) return false;
      if (error?.code === "stale-revision") {
        try {
          const loaded = await read(abort.signal);
          if (valid()) publish({ ...loaded, notice: "priority.stale" });
        } catch {
          if (valid()) publish({ state: null, candidates: [], notice: "priority.error" });
        }
      } else publish({ ...action === "load" ? { state: null, candidates: [] } : {}, notice: noticeFor(error?.code) });
      return false;
    } finally {
      if (valid()) {
        flight = null;
        publish({ pending: null });
      }
    }
  }
  const ready = () => active && !snapshot.pending && snapshot.state !== null;
  return {
    subscribe(listener) {
      listeners2.add(listener);
      return () => listeners2.delete(listener);
    },
    getSnapshot: () => snapshot,
    start() {
      if (!active) {
        active = true;
        publish({ pending: null });
      }
      return run("load");
    },
    reload() {
      return run("load");
    },
    authorize(provider, consent) {
      if (!ready()) return Promise.resolve(false);
      if (consent !== true) {
        publish({ notice: "priority.noConsent" });
        return Promise.resolve(false);
      }
      if (!availableCandidates(snapshot.candidates, snapshot.state).some((item) => item.id === provider)) {
        publish({ notice: "priority.refused" });
        return Promise.resolve(false);
      }
      return run("authorize", { provider, consent: true, expectedRevision: snapshot.state.revision });
    },
    revoke(provider) {
      if (!ready()) return Promise.resolve(false);
      if (!snapshot.state.authorized.includes(provider) || snapshot.state.configured.includes(provider)) {
        publish({ notice: "priority.refused" });
        return Promise.resolve(false);
      }
      return run("revoke", { provider, expectedRevision: snapshot.state.revision });
    },
    dispose() {
      active = false;
      stop();
    }
  };
}
function PriorityPanel({ connection, t, onChanged }) {
  const changed = import_react11.default.useRef(onChanged);
  changed.current = onChanged;
  const controller = import_react11.default.useMemo(() => createPriorityController(connection, { onChanged: () => changed.current?.() }), [connection]);
  const snapshot = import_react11.default.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [selected, setSelected] = import_react11.default.useState("");
  const [consent, setConsent] = import_react11.default.useState(false);
  import_react11.default.useEffect(() => {
    void controller.start();
    return () => controller.dispose();
  }, [controller]);
  import_react11.default.useEffect(() => {
    setConsent(false);
  }, [snapshot.state?.revision, snapshot.notice]);
  import_react11.default.useEffect(() => {
    if (selected && !availableCandidates(snapshot.candidates, snapshot.state).some((item) => item.id === selected)) {
      setSelected("");
      setConsent(false);
    }
  }, [snapshot.candidates, snapshot.state, selected]);
  return h10(PriorityPanelContent, {
    ...snapshot,
    consent,
    selected,
    t,
    onSelect: (value) => {
      setSelected(value);
      setConsent(false);
    },
    onConsent: (value) => setConsent(value === true),
    onAuthorize: (provider, confirmed) => {
      void controller.authorize(provider, confirmed);
    },
    onRevoke: (provider) => {
      void controller.revoke(provider);
    },
    onReload: () => {
      setConsent(false);
      void controller.reload();
    }
  });
}
var import_react11, h10, ENDPOINT, PROVIDER, providerIds, notices, noticeFor;
var init_priority_panel = __esm({
  "assist/client/priority-panel.js"() {
    import_react11 = __toESM(require("react"), 1);
    init_identity();
    init_policy();
    init_priority_source();
    h10 = import_react11.default.createElement;
    ENDPOINT = "local-openai-fast.priority";
    PROVIDER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
    providerIds = (values) => Array.isArray(values) ? [...new Set(values.filter((value) => typeof value === "string" && PROVIDER.test(value)))] : [];
    notices = Object.freeze({
      "consent-required": "priority.noConsent",
      "provider-unknown": "priority.unknownProvider",
      "provider-not-openai": "priority.refused",
      "invalid-provider": "priority.refused",
      "configured-provider": "priority.refused"
    });
    noticeFor = (code2) => typeof code2 === "string" && Object.hasOwn(notices, code2) ? notices[code2] : "priority.error";
  }
});

// assist/client/settings-page-state.js
function createSettingsDraft(config) {
  return { config: sessionSettings(config), version: 0, dirty: false };
}
function editSettingsDraft(state, config) {
  return { config: sessionSettings(config), version: state.version + 1, dirty: true };
}
function acceptSettingsSave(state, version3, config) {
  if (state.version !== version3) return state;
  return { config: sessionSettings(config), version: version3, dirty: false };
}
function createSettingsRequests() {
  let closed = false;
  const requests = /* @__PURE__ */ new Set();
  return {
    begin() {
      const abort = new AbortController();
      if (closed) abort.abort();
      else requests.add(abort);
      return {
        signal: abort.signal,
        valid: () => !closed && !abort.signal.aborted,
        finish: () => requests.delete(abort)
      };
    },
    close() {
      closed = true;
      for (const request of requests) request.abort();
      requests.clear();
    }
  };
}
var init_settings_page_state = __esm({
  "assist/client/settings-page-state.js"() {
    init_api();
  }
});

// assist/client/settings-page.js
function FeatureSettings({ feature, host, sessionId, p, allowed, onSaved }) {
  const [draft, setDraft] = import_react12.default.useState(() => createSettingsDraft(host.settings[feature]));
  const current = import_react12.default.useRef(draft);
  current.current = draft;
  const [saving, setSaving] = import_react12.default.useState(false), [notice, setNotice] = import_react12.default.useState(null);
  const scope = import_react12.default.useRef(null), inFlight = import_react12.default.useRef(false);
  import_react12.default.useEffect(() => {
    scope.current = createSettingsRequests();
    inFlight.current = false;
    return () => scope.current.close();
  }, []);
  const runtime = { sessionId, send: p.assistSend, currentModel: host.current };
  const options = useModelOptions(runtime, feature, draft.config, true);
  const edit = (config) => {
    const next = editSettingsDraft(current.current, config);
    current.current = next;
    setDraft(next);
    setNotice(null);
  };
  async function save(config) {
    if (!allowed || inFlight.current || !scope.current) return;
    const request = scope.current.begin(), version3 = current.current.version;
    inFlight.current = true;
    setSaving(true);
    setNotice(null);
    try {
      const value = await p.assistSend("save", sessionId, { feature, config: sessionSettings(config) }, request.signal);
      if (!request.valid()) return;
      onSaved(feature, value);
      const next = acceptSettingsSave(current.current, version3, value.settings[feature]);
      current.current = next;
      setDraft(next);
      if (!next.dirty) setNotice("saved");
      await p.refreshAssist(sessionId).catch(() => {
      });
    } catch (error) {
      if (request.valid()) setNotice(error);
    } finally {
      request.finish();
      if (request.valid()) {
        inFlight.current = false;
        setSaving(false);
      }
    }
  }
  const noticeValue = notice ?? options.error;
  return h11(
    "section",
    { className: "lpa-feature", "aria-label": p.t(feature) },
    h11("h2", { className: "lpa-feature-title" }, p.t(feature)),
    h11("p", { className: "lpa-note" }, p.t(feature === "suggest" ? "suggestContext" : "enhanceOriginal")),
    h11(Settings, { t: p.t, config: draft.config, catalog: options.catalog, capabilities: options.capabilities, allowed, saving, onChange: edit, save }),
    h11(
      "div",
      { className: "lpa-settings-feedback" },
      draft.dirty ? h11("p", { className: "lpa-note" }, p.t("settingsChanged")) : null,
      noticeValue ? h11("p", { role: "status", className: noticeValue === "saved" ? "lpa-note" : "lpa-error" }, typeof noticeValue === "string" && noticeValue !== "requestError" ? p.t(noticeValue) : errorText(noticeValue, p.t)) : null
    )
  );
}
function SessionSettings({ sessionId, p }) {
  const allowed = p.useSessionAccess(sessionId, "commands/execute");
  const [host, setHost] = import_react12.default.useState(null), [error, setError] = import_react12.default.useState(null);
  import_react12.default.useEffect(() => {
    const abort = new AbortController();
    setHost(null);
    setError(null);
    p.assistSend("state", sessionId, {}, abort.signal).then((value) => {
      if (!abort.signal.aborted) setHost(value);
    }).catch((error2) => {
      if (!abort.signal.aborted) setError(error2);
    });
    return () => abort.abort();
  }, [sessionId, p.assistSend]);
  const onSaved = (feature, value) => setHost((old) => ({ ...old, settings: { ...old.settings, [feature]: value.settings[feature] } }));
  return h11(
    import_react12.default.Fragment,
    null,
    h11("p", { className: "lpa-note" }, p.t("editingSession"), ": ", h11("code", null, sessionId)),
    !allowed ? h11("p", { className: "lpa-note" }, p.t("access")) : null,
    error ? h11("p", { className: "lpa-error", role: "alert" }, errorText(error, p.t)) : null,
    !host && !error ? h11("p", { role: "status" }, p.t("loading")) : null,
    host ? h11("div", { className: "lpa-settings-cards" }, ["suggest", "enhance"].map((feature) => h11(FeatureSettings, { key: feature, feature, host, sessionId, p, allowed, onSaved }))) : null
  );
}
function SettingsPage(p) {
  const target = import_react12.default.useSyncExternalStore(p.targetSource.subscribe, p.targetSource.getSnapshot, p.targetSource.getSnapshot);
  return h11(
    "section",
    { className: "lpa lpa-settings-page", "aria-label": p.t("title") },
    h11("header", { className: "lpa-settings-header" }, h11("h1", null, p.t("title")), h11("button", { type: "button", className: "lpa-button", onClick: p.returnToConversation }, p.t("returnConversation"))),
    h11(EnablementPanel, { globalSource: p.globalSource, t: p.t }),
    h11("p", { className: "lpa-note" }, p.t("sessionScope")),
    target.sessionId ? h11(SessionSettings, { key: target.sessionId, sessionId: target.sessionId, p }) : h11("p", { role: "status" }, p.t("chooseSession")),
    p.connection ? h11(PriorityPanel, { connection: p.connection, t: p.t, onChanged: () => {
      if (target.sessionId) void p.refreshAssist(target.sessionId).catch(() => {
      });
    } }) : null,
    h11(UpdatePanel, { t: p.t })
  );
}
var import_react12, h11;
var init_settings_page = __esm({
  "assist/client/settings-page.js"() {
    init_update_panel();
    import_react12 = __toESM(require("react"), 1);
    init_settings();
    init_runtime();
    init_api();
    init_enablement_panel();
    init_priority_panel();
    init_settings_page_state();
    h11 = import_react12.default.createElement;
  }
});

// assist/client/settings-target.js
function createSettingsTarget() {
  let state = { sessionId: null };
  const listeners2 = /* @__PURE__ */ new Set();
  return { getSnapshot: () => state, subscribe(fn) {
    listeners2.add(fn);
    return () => listeners2.delete(fn);
  }, select(sessionId) {
    if (state.sessionId === sessionId) return;
    state = { sessionId };
    listeners2.forEach((fn) => fn());
  } };
}
var init_settings_target = __esm({
  "assist/client/settings-target.js"() {
  }
});

// assist/client/index.js
var client_exports = {};
__export(client_exports, {
  installAssist: () => installAssist
});
function AssistIcon({ size = 20 }) {
  return h12("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, "aria-hidden": true }, h12("path", { d: "M4 5h10M4 10h7M4 15h6M14 4v4m-2-2h4M17 10l3 3-7 7H10v-3Z" }));
}
function SettingsSurface(p) {
  return h12(import_react13.default.Fragment, null, h12("style", null, css), h12(SettingsPage, p));
}
function installAssist(ctx) {
  ctx.effect(() => ctx.locale.register(NS, dictionaries));
  const actions = /* @__PURE__ */ new WeakMap(), targetSource = createSettingsTarget();
  const assistSend = createAssistRpcApi(ctx.connection);
  const globalSource = createEnablementSource({ send: assistSend });
  ctx.effect(() => {
    void globalSource.start();
    return () => globalSource.dispose();
  });
  const inject2 = (sessionId) => {
    const binding = ctx.sessions.binding(sessionId);
    if (!binding) throw Error("Prompt assist requires a retained session binding");
    if (!actions.has(binding)) actions.set(binding, { enhance: createEnhanceAction(), suggest: createEnhanceAction() });
    const observe = (source) => ({ subscribe: (fn) => source.subscribe(fn), getSnapshot: () => source.getSnapshot() });
    return {
      assistEnhance: actions.get(binding).enhance,
      assistSuggest: actions.get(binding).suggest,
      assistSend,
      globalSource,
      settingsTarget: targetSource,
      assistModel: observe(binding.session.projections.faceOf("modelSelection")),
      assistSource: observe(binding.session.projections.faceOf(ASSIST_KEY)),
      refreshAssist: () => ctx.sessions.refreshProjections(sessionId)
    };
  };
  const label = () => {
    const language = ctx.locale.getLocale().active;
    return dictionaries[language]?.title ?? (language.startsWith("zh") ? dictionaries.zh.title : dictionaries.en.title);
  };
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: "local-prompt-assist", order: 40, label, locale: NS }, AssistIcon));
  ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: "local-prompt-assist", locale: NS, inject: () => ({ assistSend, globalSource, targetSource, connection: ctx.connection, returnToConversation: () => ctx.layout.selectPanel(null), refreshAssist: (id2) => ctx.sessions.refreshProjections(id2) }) }, SettingsSurface));
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({ name: "conversation.input.right", id: "local-prompt-enhance-action", order: 1005, label: dictionaries.en.enhance, locale: NS, inject: inject2 }, EnhanceButton));
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({ name: "conversation.input.right", id: "local-next-question-action", order: 1010, label: dictionaries.en.suggest, locale: NS, inject: inject2 }, SuggestButton));
  ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({ name: "conversation.input.dock", id: "local-prompt-assist-results", order: 50, label, locale: NS, inject: inject2 }, AssistPanel));
}
var import_react13, h12;
var init_client = __esm({
  "assist/client/index.js"() {
    import_react13 = __toESM(require("react"), 1);
    init_enhance_action();
    init_enhance_button();
    init_suggest_button();
    init_identity();
    init_rpc_transport();
    init_messages();
    init_panel();
    init_settings_page();
    init_style();
    init_settings_target();
    init_enablement_source();
    h12 = import_react13.default.createElement;
  }
});

// client-entry.js
var client_entry_exports = {};
__export(client_entry_exports, {
  HiddenFastCommand: () => HiddenFastCommand,
  apply: () => apply,
  createToggleController: () => createToggleController,
  derivePresentation: () => derivePresentation,
  hydrateSession: () => hydrateSession,
  inject: () => inject,
  quietCommandNames: () => quietCommandNames
});
module.exports = __toCommonJS(client_entry_exports);
init_identity();

// client-fast-core.js
init_policy();
init_priority_source();
function createFast(require2) {
  let React14;
  let h13;
  const NS2 = "local-openai-fast";
  const quietCommandNames2 = Object.freeze(["openai-fast", "openai-fast-ui-health"]);
  function HiddenFastCommand2() {
    return null;
  }
  const hydratingBindings = /* @__PURE__ */ new WeakMap();
  function hasFastState(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof value.enabled === "boolean" && Array.isArray(value.providers) && value.providers.every((provider) => typeof provider === "string"));
  }
  function derivePresentation2(fastState, selected, fallback) {
    const selection = selected ?? fallback;
    const family = isOpenAIModel(selection?.model);
    const ready = hasFastState(fastState);
    const eligible = Boolean(family && ready && fastState.providers.includes(selection.provider));
    return {
      visible: family,
      enabled: eligible && fastState.enabled === true,
      eligible,
      reason: !selection ? "no-selection" : !family ? "unsupported-model" : !ready ? "loading" : !eligible ? "unsupported-provider" : "ready"
    };
  }
  function hydrateSession2(readyBindings, binding, sessionId, refresh, isReady = () => true) {
    if (readyBindings.has(binding)) {
      if (isReady()) return Promise.resolve(true);
      readyBindings.delete(binding);
    }
    if (hydratingBindings.has(binding)) return hydratingBindings.get(binding);
    let read;
    try {
      read = Promise.resolve(refresh(sessionId));
    } catch (error) {
      read = Promise.reject(error);
    }
    const operation = read.then(() => {
      hydratingBindings.delete(binding);
      const ready = isReady() === true;
      if (ready) readyBindings.add(binding);
      return ready;
    }, (error) => {
      hydratingBindings.delete(binding);
      readyBindings.delete(binding);
      throw error;
    });
    hydratingBindings.set(binding, operation);
    void operation.catch(() => {
    });
    return operation;
  }
  function createHydrationRetry({ attempt, isReady, onSettled = () => {
  }, setTimer = setTimeout, clearTimer = clearTimeout, delays = [250, 1e3] }) {
    let operation, resolve, timer = null, disposed = false, finished = false;
    const finish = (ready, publish = true) => {
      if (finished) return;
      finished = true;
      if (publish && !disposed) {
        try {
          onSettled(ready);
        } catch {
        }
      }
      resolve?.(ready);
    };
    async function run(index) {
      try {
        await attempt();
      } catch {
      }
      if (disposed || finished) return;
      let ready = false;
      try {
        ready = isReady() === true;
      } catch {
      }
      if (ready) {
        finish(true);
        return;
      }
      if (index >= delays.length) {
        finish(false);
        return;
      }
      try {
        timer = setTimer(() => {
          timer = null;
          void run(index + 1);
        }, delays[index]);
      } catch {
        finish(false);
      }
    }
    return {
      start() {
        if (operation) return operation;
        if (disposed) return operation = Promise.resolve(false);
        operation = new Promise((done) => {
          resolve = done;
        });
        void run(0);
        return operation;
      },
      dispose() {
        disposed = true;
        if (timer !== null) clearTimer(timer);
        timer = null;
        finish(false, false);
      }
    };
  }
  function createToggleController2({ initial: initial2, send, publish, onError }) {
    let confirmed = initial2;
    let desired = initial2;
    let running = false;
    let operation = Promise.resolve();
    let last;
    function notify() {
      if (last?.enabled === desired && last.pending === running) return;
      last = { enabled: desired, pending: running };
      publish(last);
    }
    async function drain() {
      try {
        while (desired !== confirmed) {
          const sent = desired;
          try {
            await send(sent);
          } catch (error) {
            desired = confirmed;
            onError(error);
            break;
          }
          confirmed = sent;
        }
      } finally {
        running = false;
        notify();
      }
    }
    return {
      toggle() {
        desired = !desired;
        if (running) {
          notify();
          return operation;
        }
        running = true;
        notify();
        operation = drain();
        return operation;
      },
      sync(value) {
        if (running) return;
        confirmed = desired = value;
        notify();
      }
    };
  }
  const dictionaries2 = {
    zh: {
      label: "Fast",
      off: "Fast \u5DF2\u5173\u95ED\u3002\u5F00\u542F\u540E\uFF0C\u540E\u7EED\u672C\u4F1A\u8BDD\u53CA\u7EE7\u627F\u8BBE\u7F6E\u7684 OpenAI \u5B50\u667A\u80FD\u4F53\u8BF7\u6C42\u4F7F\u7528 Priority \u4F18\u5148\u5904\u7406\uFF1B\u9700\u8981\u670D\u52A1\u5546\u652F\u6301\uFF0C\u53EF\u80FD\u989D\u5916\u8BA1\u8D39\u3002",
      on: "Fast \u5DF2\u5F00\u542F\u3002\u540E\u7EED\u672C\u4F1A\u8BDD\u53CA\u7EE7\u627F\u8BBE\u7F6E\u7684 OpenAI \u5B50\u667A\u80FD\u4F53\u8BF7\u6C42\u4F7F\u7528 Priority \u4F18\u5148\u5904\u7406\uFF0C\u53EF\u80FD\u989D\u5916\u8BA1\u8D39\uFF1B\u70B9\u51FB\u5173\u95ED\u3002",
      saving: "\u6B63\u5728\u4FDD\u5B58 Fast \u8BBE\u7F6E\u2026",
      error: "Fast \u8BBE\u7F6E\u672A\u4FDD\u5B58\uFF0C\u8BF7\u91CD\u8BD5\u3002",
      loading: "Fast \u72B6\u6001\u5C1A\u672A\u786E\u8BA4\uFF0C\u5F00\u5173\u6682\u4E0D\u53EF\u7528\uFF1B\u8FD9\u4E0D\u4F1A\u66F4\u6539\u5DF2\u4FDD\u5B58\u7684 Fast \u8BBE\u7F6E\u3002",
      loadError: "Fast \u72B6\u6001\u540C\u6B65\u5931\u8D25\u3002\u8BF7\u5237\u65B0\u9875\u9762\uFF0C\u6216\u68C0\u67E5 Host \u4E0E Client \u63D2\u4EF6\u7248\u672C\u662F\u5426\u4E00\u81F4\u3002",
      unsupportedProvider: "\u6B64\u4F9B\u5E94\u5546\u672A\u5728 Priority \u5141\u8BB8\u540D\u5355\u4E2D\uFF0CFast \u4E0D\u4F1A\u5F00\u542F\u3002\u53EF\u5728\u201C\u63D0\u793A\u8BCD\u8F85\u52A9 \u2192 Priority \u4F9B\u5E94\u5546\u6388\u6743\u201D\u4E2D\u81EA\u52A9\u6388\u6743\uFF08\u8BE5\u4F9B\u5E94\u5546\u5FC5\u987B\u786E\u5B9E\u63D0\u4F9B OpenAI \u7CFB\u5217\u6A21\u578B\uFF09\u3002\u4F9B\u5E94\u5546 ID",
      access: "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u6267\u884C Fast \u5F00\u5173\u547D\u4EE4\u7684\u6743\u9650\u3002"
    },
    en: {
      label: "Fast",
      off: "Fast is off. Enable Priority for this session and inheriting OpenAI subagents; provider support is required and additional charges may apply.",
      on: "Fast is on for this session and inheriting OpenAI subagents; additional charges may apply. Click to turn off.",
      saving: "Saving Fast preference\u2026",
      error: "Could not change Fast. Try again.",
      loading: "Fast status is not confirmed yet; the control is temporarily unavailable. Existing Host settings are unchanged.",
      loadError: "Fast state could not be loaded. Refresh or check that Host and Client plugin versions match.",
      unsupportedProvider: "This provider is not authorized for Priority, so Fast stays off. Authorize it under \u201CPrompt assist \u2192 Priority provider authorization\u201D; the provider must actually offer OpenAI-family models. Provider ID",
      access: "This session cannot execute Fast toggle commands."
    }
  };
  const css2 = `
      .local-openai-fast{display:inline-flex;align-items:center;position:relative;flex:none}
      .local-openai-fast__button{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:28px;padding:0 7px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:20px;white-space:nowrap;cursor:pointer}
      .local-openai-fast__button:hover:not(:disabled):not([aria-disabled=true]){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}
      .local-openai-fast__button[aria-checked=true]{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-brand-primary)}
      .local-openai-fast__button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
      .local-openai-fast__button:disabled,.local-openai-fast__button[aria-disabled=true]{opacity:.5;cursor:not-allowed}
      .local-openai-fast__button svg{display:block;flex:none}
      .local-openai-fast__error{position:absolute;bottom:34px;right:0;max-width:240px;width:max-content;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;z-index:20}
      .local-openai-fast__notice{position:absolute;bottom:34px;right:0;max-width:280px;width:max-content;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;z-index:20}
    `;
  function useDefaultSelection(remote) {
    const [selection, setSelection] = React14.useState(null);
    React14.useEffect(() => {
      let active = true;
      remote.session.modelCatalog().then((result) => {
        if (active && result.ok) setSelection(result.value.default);
      }).catch(() => {
      });
      return () => {
        active = false;
      };
    }, [remote]);
    return selection;
  }
  function FastToggle(props) {
    const fastState = React14.useSyncExternalStore(props.fastSource.subscribe, props.fastSource.getSnapshot, props.fastSource.getSnapshot);
    const modelState = React14.useSyncExternalStore(props.modelSource.subscribe, props.modelSource.getSnapshot, props.modelSource.getSnapshot);
    const priorityState = props.prioritySource ? React14.useSyncExternalStore(props.prioritySource.subscribe, props.prioritySource.getSnapshot, props.prioritySource.getSnapshot) : null;
    const selected = modelState?.next ?? null;
    const defaultSelection = useDefaultSelection(props.remote);
    const sessionState = React14.useSyncExternalStore(props.sessionSource.subscribe, props.sessionSource.getSnapshot, props.sessionSource.getSnapshot);
    const unavailable = Boolean(sessionState?.subagent) || sessionState?.removed === true;
    const allowed = props.useAccess("commands/execute");
    const wireProviders = Array.isArray(fastState?.providers) ? fastState.providers : [];
    const authorized = priorityState?.status === "ready" && Array.isArray(priorityState.authorized) ? priorityState.authorized : [];
    const providers = [...wireProviders];
    for (const provider2 of authorized) if (typeof provider2 === "string" && !providers.includes(provider2)) providers.push(provider2);
    const priorityReady = priorityState?.status === "ready" && (Array.isArray(priorityState.effective) || providers.length > 0);
    const viewState = hasFastState(fastState) ? { enabled: fastState.enabled === true, providers } : priorityReady ? { enabled: false, providers } : fastState;
    const { visible, enabled, eligible, reason } = derivePresentation2(viewState, selected, defaultSelection);
    const ready = hasFastState(fastState);
    const [loadFailed, setLoadFailed] = React14.useState(false);
    React14.useEffect(() => {
      setLoadFailed(false);
      const retry = createHydrationRetry({
        attempt: props.ensureHydrated,
        isReady: () => hasFastState(props.fastSource.getSnapshot()),
        onSettled: (value) => setLoadFailed(!value)
      });
      void retry.start();
      return () => retry.dispose();
    }, [props.hydrationKey, props.sessionId, ready]);
    const [interaction, setInteraction] = React14.useState({ enabled: null, pending: false });
    const [error, setError] = React14.useState("");
    const [notice, setNotice] = React14.useState("");
    const alive = React14.useRef(true);
    React14.useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
      };
    }, []);
    const controller = React14.useMemo(() => createToggleController2({
      initial: enabled,
      send: async (next) => {
        const result = await props.remote.commands.execute(
          props.sessionId,
          `/openai-fast ${next ? "on" : "off"}`,
          []
        );
        if (!result.ok) throw new Error(result.error.message);
        if (result.value?.result.kind !== "success") {
          throw new Error(result.value?.result.text ?? props.t("error"));
        }
      },
      publish: (value) => {
        if (alive.current) setInteraction(value);
      },
      onError: (failure) => {
        if (alive.current) setError(failure instanceof Error ? failure.message : props.t("error"));
        props.refresh().catch(() => {
        });
      }
    }), [props.remote, props.sessionId]);
    React14.useEffect(() => controller.sync(enabled), [controller, enabled]);
    const checked = eligible && (interaction.enabled ?? enabled);
    const provider = (selected ?? defaultSelection)?.provider ?? "";
    const blocked = reason === "loading" ? props.t(loadFailed ? "loadError" : "loading") : reason === "unsupported-provider" ? props.t("unsupportedProvider") + ": " + provider : !allowed ? props.t("access") : null;
    React14.useEffect(() => {
      if (!blocked) setNotice("");
    }, [blocked]);
    if (!visible || unavailable) return null;
    function toggle() {
      if (!eligible || !allowed) {
        if (blocked) setNotice(blocked);
        return;
      }
      setError("");
      setNotice("");
      controller.toggle().catch(() => {
      });
    }
    return h13(
      "span",
      { className: "local-openai-fast", title: blocked ?? props.t(checked ? "on" : "off") },
      h13("style", null, css2),
      h13("button", {
        type: "button",
        role: "switch",
        className: "local-openai-fast__button",
        "aria-label": props.t("label"),
        "aria-checked": checked,
        "aria-busy": interaction.pending || reason === "loading" && !loadFailed,
        "aria-disabled": !allowed || !eligible,
        onClick: toggle
      }, h13(
        "svg",
        { viewBox: "0 0 20 20", width: 14, height: 14, fill: "none", "aria-hidden": true },
        h13("path", {
          d: "M11.5 2 4 11h5l-.5 7L16 8h-5l.5-6Z",
          stroke: "currentColor",
          strokeWidth: 1.5,
          strokeLinejoin: "round",
          fill: checked ? "currentColor" : "none"
        })
      ), props.t("label")),
      notice ? h13("span", { role: "status", className: "local-openai-fast__notice" }, notice) : null,
      error ? h13("span", { role: "alert", className: "local-openai-fast__error" }, error) : null
    );
  }
  return {
    derivePresentation: derivePresentation2,
    hydrateSession: hydrateSession2,
    createHydrationRetry,
    createToggleController: createToggleController2,
    quietCommandNames: quietCommandNames2,
    HiddenFastCommand: HiddenFastCommand2,
    inject: ["slots", "locale", "sessions", "remote", "remote.commands", "remote.session"],
    apply(ctx) {
      React14 = require2("react");
      h13 = React14.createElement;
      ctx.effect(() => ctx.locale.register(NS2, dictionaries2));
      const prioritySource = createPrioritySource(ctx.connection);
      ctx.effect(() => {
        const off = onPriorityChanged(() => {
          void prioritySource.refresh();
        });
        void prioritySource.refresh();
        return () => {
          off();
          prioritySource.dispose();
        };
      });
      ctx.slots.inject("conversation.chat.commandview", () => quietCommandNames2.map((key) => ctx.slots.register({ name: "conversation.chat.commandview", key }, HiddenFastCommand2)));
      const readyBindings = /* @__PURE__ */ new WeakSet();
      ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
        name: "conversation.input.right",
        id: "local-openai-fast",
        order: 1020,
        label: "OpenAI Fast",
        locale: NS2,
        inject(sessionId) {
          const binding = ctx.sessions.binding(sessionId);
          if (!binding) throw new Error("OpenAI Fast: no retained session binding");
          const observe = (source) => ({
            subscribe: (listener) => source.subscribe(listener),
            getSnapshot: () => source.getSnapshot()
          });
          const refresh = () => ctx.sessions.refreshProjections(sessionId);
          const fastSource = observe(binding.session.projections.faceOf("local.openaiFast"));
          return {
            remote: ctx.remote,
            refresh,
            hydrationKey: binding,
            prioritySource,
            ensureHydrated: () => hydrateSession2(readyBindings, binding, sessionId, refresh, () => hasFastState(fastSource.getSnapshot())),
            fastSource,
            modelSource: observe(binding.session.projections.faceOf("modelSelection")),
            sessionSource: observe(binding.session)
          };
        }
      }, FastToggle));
    }
  };
}

// client-entry.js
var fast = createFast(require);
var { derivePresentation, hydrateSession, createToggleController, quietCommandNames, HiddenFastCommand } = fast;
var inject = [...fast.inject, "connection", "layout"];
async function apply(ctx) {
  fast.apply(ctx);
  ctx.slots.inject("conversation.chat.commandview", () => [ASSIST_COMMAND, LEGACY_COMMAND].map((key) => ctx.slots.register({ name: "conversation.chat.commandview", key }, fast.HiddenFastCommand)));
  const { installAssist: installAssist2 } = await Promise.resolve().then(() => (init_client(), client_exports));
  return installAssist2(ctx);
}
return module.exports;}});
