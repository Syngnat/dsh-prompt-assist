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

// model-id.js
function parseModelId(value) {
  if (typeof value !== "string" || value.length === 0 || UNSAFE.test(value)) return null;
  const segments = value.split("/");
  if (segments.some((part) => part.length === 0 || part === "." || part === "..")) return null;
  if (segments.slice(0, -1).some((part) => !NAMESPACE.test(part))) return null;
  const last = segments[segments.length - 1];
  const family = MODEL_FAMILIES.find((entry) => entry.test(last))?.id ?? "other";
  return Object.freeze({ id: value, segments: Object.freeze(segments), last, family });
}
function modelFamily(model) {
  return parseModelId(model)?.family ?? "other";
}
function isPriorityModel(model) {
  const family = modelFamily(model);
  return MODEL_FAMILIES.some((entry) => entry.id === family);
}
var NAMESPACE, UNSAFE, MODEL_FAMILIES;
var init_model_id = __esm({
  "model-id.js"() {
    NAMESPACE = /^[\p{L}\p{M}\p{N}_.-]+$/u;
    UNSAFE = /[\s\\?#\u0000-\u001f\u007f]/u;
    MODEL_FAMILIES = Object.freeze([
      Object.freeze({
        id: "openai",
        test: (last) => /^(?:gpt-|chatgpt-|codex(?:-|$)|o[1-9](?:-|$))/i.test(last)
      }),
      Object.freeze({
        // Grok 4 and later; forward-compatible with future major versions. grok-1/2/3 are out of scope.
        id: "xai",
        test: (last) => /^grok-(?:[4-9]|[1-9]\d+)(?:[.-]|$)/i.test(last)
      })
    ]);
  }
});

// fast-route.js
function routeKey(provider, model) {
  return provider + "\0" + model;
}
function normalizeGrants(value) {
  const list = typeof value === "function" ? value() : value;
  if (!Array.isArray(list)) return Object.freeze([]);
  const grants = [];
  for (const item of list) {
    if (typeof item === "string") {
      if (item) grants.push(grant(item, null, null));
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const provider = typeof item.provider === "string" ? item.provider : "";
    if (!provider) continue;
    const model = typeof item.model === "string" && item.model ? item.model : null;
    const family = typeof item.family === "string" && item.family && item.family !== "other" ? item.family : null;
    grants.push(grant(provider, model, family));
  }
  return Object.freeze(grants);
}
function matchGrant(value, route) {
  if (!route) return null;
  let family = null;
  for (const candidate of normalizeGrants(value)) {
    if (candidate.provider !== route.provider) continue;
    if (candidate.model) {
      if (candidate.model === route.model) return candidate;
      continue;
    }
    if (candidate.family) {
      if (candidate.family === route.family) family = family ?? candidate;
      continue;
    }
    return candidate;
  }
  return family;
}
function resolveFastRoute(selection, policy = {}) {
  const provider = selection && typeof selection.provider === "string" && selection.provider ? selection.provider : "";
  const parsed = parseModelId(selection && selection.model);
  const route = provider && parsed ? Object.freeze({
    provider,
    model: parsed.id,
    family: parsed.family,
    api: policy.apis?.[provider] ?? null
  }) : null;
  if (!route || route.family === "other") return result("not-candidate", route);
  if (route.api && !SUPPORTED_APIS.has(route.api)) return result("api-incompatible", route);
  const evidence = policy.routes?.[routeKey(route.provider, route.model)] ?? null;
  const priority = evidence?.priority ?? "unknown";
  if (priority === "rejected") return result("rejected", route, matchGrant(policy.grants, route), evidence);
  const granted = matchGrant(policy.grants, route);
  if (granted) return result("ready", route, granted, evidence);
  if (priority === "verified") return result("grant-missing", route, null, evidence);
  return result("needs-verification", route, null, evidence);
}
var SUPPORTED_APIS, FAST_ROUTE_STATES, ROUTE_EVIDENCE, grant, result;
var init_fast_route = __esm({
  "fast-route.js"() {
    init_model_id();
    SUPPORTED_APIS = /* @__PURE__ */ new Set(["openai-responses", "openai-completions", "openai-codex-responses"]);
    FAST_ROUTE_STATES = Object.freeze([
      "ready",
      "needs-verification",
      "grant-missing",
      "rejected",
      "api-incompatible",
      "not-candidate"
    ]);
    ROUTE_EVIDENCE = Object.freeze(["verified", "declared", "unknown", "rejected"]);
    grant = (provider, model, family) => Object.freeze({ provider, model, family });
    result = (state, route, grant2, evidence) => Object.freeze({
      state,
      visible: state === "ready" || state === "needs-verification" || state === "grant-missing" || state === "rejected",
      eligible: state === "ready",
      route,
      grant: grant2 ?? null,
      evidence: evidence ?? null
    });
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
  let snapshot = Object.freeze({ status: "idle", revision: null, authorized: Object.freeze([]), effective: Object.freeze([]), names: Object.freeze({}) });
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
        const result2 = await connection.rpc.call(ASSIST_CHANNEL, PRIORITY_ENDPOINT, { action: "snapshot" });
        if (disposed || token !== epoch) return snapshot;
        if (result2?.ok !== true) {
          publish({ ...snapshot, status: "error" });
          return snapshot;
        }
        const value = result2.value;
        publish({
          status: "ready",
          revision: Number.isSafeInteger(value?.revision) ? value.revision : null,
          authorized: Object.freeze(ids(value?.authorized)),
          effective: Object.freeze(ids(value?.effective)),
          names: displayNames(value?.names)
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
var listeners, ids, displayNames;
var init_priority_source = __esm({
  "assist/client/priority-source.js"() {
    init_identity();
    listeners = /* @__PURE__ */ new Set();
    ids = (value) => Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === "string"))] : [];
    displayNames = (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return Object.freeze({});
      return Object.freeze(Object.fromEntries(Object.entries(value).filter(([id2, name]) => typeof id2 === "string" && id2.length > 0 && id2.length <= 64 && typeof name === "string" && name.length > 0 && name.length <= 80).slice(0, 64)));
    };
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
.lpa-settings-nav{display:flex;flex-wrap:wrap;gap:8px;min-width:0;margin-bottom:18px}
.lpa-nav-item{display:inline-flex;align-items:center;box-sizing:border-box;min-height:34px;padding:7px 14px;border:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l1));border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:18px;cursor:pointer}
.lpa-nav-item:hover:not(.lpa-nav-item--active){background:var(--dsw-alias-interactive-bg-hover)}
.lpa-nav-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.lpa-nav-item--active{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:500;border-color:var(--dsw-alias-border-l2,var(--dsw-alias-border-l1))}
.lpa-settings-panels{display:grid;gap:16px;min-width:0}
.lpa-settings-panel{display:grid;gap:16px;min-width:0}
.lpa-settings-panel[hidden]{display:none}
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
.lpa-card-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px;min-width:0}
.lpa-update-consent-inline{display:flex;align-items:center;gap:8px;flex:1 1 260px;min-width:0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary)}.lpa-card-actions>.lpa-button:not(.lpa-button--primary){min-height:32px;padding:6px 10px}
.lpa-priority-actions{display:grid;gap:12px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l1)}.lpa-priority-actions .lpa-action-buttons{justify-content:flex-end}.lpa-priority-actions .lpa-check{align-items:flex-start;gap:10px;font-size:12px}.lpa-priority-actions .lpa-check input{flex:none;margin-top:3px}.lpa-card .lpa-field select{min-height:34px;padding:6px 8px}
.lpa-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.lpa-stat{min-width:0;padding:14px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-layer-2)}.lpa-stat dt{margin-bottom:6px;color:var(--dsw-alias-label-secondary)}.lpa-stat dd{font-size:18px;font-weight:650;line-height:1.5;color:var(--dsw-alias-label-primary)}.lpa-stat time{font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}.lpa-stat.lpa-stat--highlight{border-color:var(--dsw-alias-brand-primary)}.lpa-stat.lpa-stat--highlight dd{color:var(--dsw-alias-brand-primary)}
.lpa-divider{height:0;min-width:0;margin-top:6px;border-top:1px solid var(--dsw-alias-border-l1)}.lpa-subsection{display:grid;gap:12px;min-width:0;padding:0;margin:0;border:0;background:none}.lpa-subsection-title{font:inherit;font-size:15px;font-weight:650;line-height:1.5;margin:0;color:var(--dsw-alias-label-primary)}
.lpa-install-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px 12px;padding-top:8px;min-width:0}.lpa-install-row>span:first-child{grid-column:1/-1;font-size:11px;color:var(--dsw-alias-label-secondary)}.lpa-install-row code{box-sizing:border-box;min-width:0;max-width:100%;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-2);white-space:nowrap;overflow-x:auto;user-select:text;font-size:12px}.lpa-install-row>.lpa-button{white-space:nowrap;min-height:32px}.lpa-install-row>[role=status]{grid-column:1/-1}
@media(max-width:720px){.lpa.lpa-settings-page{padding:16px}.lpa-settings-header{flex-direction:column;align-items:stretch;gap:12px}.lpa-settings-heading{flex-basis:auto}.lpa-settings-header>.lpa-button{max-width:100%}.lpa-card{padding:18px}.lpa-stats,.lpa-settings-cards{grid-template-columns:minmax(0,1fr)}.lpa-card-actions{align-items:stretch}.lpa-card-actions>.lpa-button,.lpa-card-actions>.lpa-row>.lpa-button{flex:1 1 160px}.lpa-provider-item{flex-basis:100%}.lpa-settings-cards{margin-top:8px}.lpa-settings-nav{gap:6px}.lpa-nav-item{padding:6px 10px}}
@media(forced-colors:active){.lpa-switch{appearance:auto;-webkit-appearance:auto}.lpa-switch::before{display:none}}
.lpa-style-options{display:grid;gap:8px;min-width:0}
.lpa-style-option{display:grid;gap:2px;box-sizing:border-box;width:100%;min-height:0;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:start;cursor:pointer}
.lpa-style-option:hover{background:var(--dsw-alias-interactive-bg-hover)}
.lpa-style-option:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.lpa-style-option--active{border-color:var(--dsw-alias-brand-primary)}
.lpa-style-option--active .lpa-style-option-name{color:var(--dsw-alias-brand-primary)}
.lpa-style-option-name{font-size:13px;font-weight:500;line-height:18px}
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
  let buffer = "", text = "", result2, complete = false;
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
      result2 = frame.value;
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
    return result2;
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
    let result2;
    try {
      result2 = await connection.rpc.call(
        ASSIST_CHANNEL,
        ASSIST_ENDPOINT,
        { ...input, action, sessionId },
        signal
      );
    } catch (error) {
      if (signal?.aborted) throw error;
      throw Object.assign(new Error("transport-unavailable"), { code: "transport-unavailable" });
    }
    if (result2?.ok !== true) {
      const code2 = result2?.error?.code ?? "transport-invalid-response";
      throw Object.assign(new Error(code2), { code: code2 });
    }
    return result2.value;
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
        "global.finalAnswer": "\u6536\u5C3E\u5951\u7EA6",
        "global.finalAnswerHint": "\u6BCF\u4F1A\u8BDD\u6CE8\u5165\u4E00\u6B21 Codex \u5F0F\u6536\u5C3E\u8981\u6C42\uFF1A\u6700\u7EC8\u6D88\u606F\u53EA\u7ED9\u7ED3\u8BBA\u3001\u9ED8\u8BA4\u4E0D\u8D85\u8FC7 10 \u884C\uFF1B\u538B\u7F29\u540E\u81EA\u52A8\u91CD\u6CE8\u3002",
        "global.title": "\u5168\u5C40\u529F\u80FD\u5F00\u5173\uFF08\u5F53\u524D profile\uFF09",
        "global.scope": "\u5F00\u5173\u4E0E\u4E24\u9879\u529F\u80FD\u5404\u81EA\u7684\u6A21\u578B\u3001\u63A8\u7406\u6863\u3001\u8F85\u52A9 Fast \u548C\u95EE\u7B54\u8F6E\u6570\u5747\u4F5C\u7528\u4E8E\u5F53\u524D profile \u7684\u6240\u6709\u73B0\u6709\u548C\u65B0\u5EFA\u4F1A\u8BDD\uFF0C\u65E0\u9700\u9009\u62E9\u4F1A\u8BDD\u3002\u4E3B\u4F1A\u8BDD Fast \u4E0D\u53D8\u3002",
        "global.charge": "\u5F00\u542F\u4E0B\u4E00\u95EE\u5EFA\u8BAE\u540E\uFF0C\u5404\u4F1A\u8BDD\u5728\u65B0\u7684\u5B8C\u6574\u95EE\u7B54\u7ED3\u675F\u3001\u7A7A\u95F2\u4E14\u8349\u7A3F\u4E3A\u7A7A\u65F6\u53EF\u81EA\u52A8\u8BF7\u6C42\u6A21\u578B\u5E76\u4EA7\u751F\u8D39\u7528\uFF1B\u589E\u5F3A\u4ECD\u53EA\u5728\u4E3B\u52A8\u70B9\u51FB\u65F6\u8BF7\u6C42\u3002\u5173\u95ED\u4F1A\u53D6\u6D88\u8BE5\u529F\u80FD\u7684\u8FC7\u671F\u7ED3\u679C\u3002",
        "global.suggest": "\u5168\u5C40\u542F\u7528\u4E0B\u4E00\u95EE\u5EFA\u8BAE",
        "global.enhance": "\u5168\u5C40\u542F\u7528\u63D0\u793A\u8BCD\u589E\u5F3A",
        "global.suggestHint": "\u65B0\u7684\u5B8C\u6574\u95EE\u7B54\u7ED3\u675F\u3001\u4F1A\u8BDD\u7A7A\u95F2\u4E14\u8349\u7A3F\u4E3A\u7A7A\u65F6\u81EA\u52A8\u8BF7\u6C42\u4E0B\u4E00\u95EE\u3002",
        "global.enhanceHint": "\u53EA\u5728\u70B9\u51FB\u201C\u589E\u5F3A\u63D0\u793A\u8BCD\u201D\u65F6\u8BF7\u6C42\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u89E6\u53D1\u3002",
        "settings.subtitle": "\u5F53\u524D profile \u7684\u5168\u5C40\u5F00\u5173\u3001\u72EC\u7ACB\u8F85\u52A9\u6A21\u578B\u4E0E\u8F6E\u6570\u3001Priority \u6388\u6743\u548C\u7248\u672C\u66F4\u65B0\uFF1B\u4E0D\u5FC5\u9009\u62E9\u4F1A\u8BDD\u3002",
        "settings.open": "\u6253\u5F00\u8BBE\u7F6E",
        "settings.profileSection": "\u5168\u5C40\u8F85\u52A9\u53C2\u6570\uFF08\u5F53\u524D profile\uFF09",
        "settings.hostUpgrade": "\u5BBF\u4E3B\u5C1A\u672A\u63D0\u4F9B\u5168\u5C40\u6A21\u578B\u53C2\u6570\uFF1B\u4E3A\u5B89\u5168\u8D77\u89C1\uFF0C\u53C2\u6570\u4FDD\u5B58\u4E0E\u8F85\u52A9\u8BF7\u6C42\u5DF2\u505C\u7528\u3002\u8BF7\u66F4\u65B0\u5E76\u91CD\u542F\u5BBF\u4E3B\u540E\u91CD\u8BFB\uFF0C\u4E0D\u4F1A\u91C7\u7528\u65E7\u4F1A\u8BDD\u53C2\u6570\u3002",
        "profileScope": "\u4E24\u9879\u529F\u80FD\u5206\u522B\u4FDD\u5B58\u6A21\u578B\u3001\u63A8\u7406\u6863\u3001\u8F85\u52A9 Fast \u4E0E\u95EE\u7B54\u8F6E\u6570\uFF0C\u4F9B\u6240\u6709\u4F1A\u8BDD\u4F7F\u7528\u3002\u8DDF\u968F\u4F1A\u8BDD\u9009\u9879\u5728\u5168\u5C40\u4FDD\u5B58\uFF0C\u8C03\u7528\u65F6\u624D\u89E3\u6790\u6240\u5728\u4F1A\u8BDD\u7684\u6A21\u578B\u3002",
        "settings.profileEmpty": "\u5C1A\u672A\u8BFB\u53D6\u5168\u5C40\u53C2\u6570\u3002\u8FDE\u63A5\u6062\u590D\u540E\u53EF\u5728\u6B64\u914D\u7F6E\uFF0C\u65E0\u9700\u5148\u6253\u5F00\u4F1A\u8BDD\u3002",
        "settings.unconfigured": "\u6B64\u529F\u80FD\u5C1A\u672A\u4FDD\u5B58\u5168\u5C40\u53C2\u6570\u3002\u65E7\u4F1A\u8BDD\u53C2\u6570\u4E0D\u4F1A\u81EA\u52A8\u8FC1\u79FB\uFF1B\u8BF7\u6838\u5BF9\u5E76\u4FDD\u5B58\u4E00\u6B21\uFF0C\u5DF2\u5F00\u542F\u7684\u5F00\u5173\u624D\u4F1A\u751F\u6548\u3002",
        "settings.modelUnknown": "\u6A21\u578B\u80FD\u529B\u6682\u672A\u77E5\uFF1A\u8FD0\u884C\u65F6\u8DDF\u968F\u6240\u5728\u4F1A\u8BDD\u7684\u6A21\u578B\u4E0E\u63A8\u7406\u6863\u3002\u8FD9\u4E0D\u5F71\u54CD\u4FDD\u5B58\u5168\u5C40\u8BBE\u7F6E\uFF1B\u8F85\u52A9 Fast \u4EC5\u5728\u5B9E\u9645\u8DEF\u7531\u652F\u6301\u65F6\u751F\u6548\u3002",
        "settings.stale": "\u5176\u4ED6\u7A97\u53E3\u5DF2\u66F4\u65B0\u5168\u5C40\u53C2\u6570\u3002\u5DF2\u4FDD\u7559\u672C\u5730\u8349\u7A3F\u4E0E\u539F\u59CB\u7248\u672C\uFF0C\u672A\u8986\u76D6\u8FDC\u7AEF\uFF1B\u8BF7\u91CD\u65B0\u8BFB\u53D6\u5E76\u6838\u5BF9\uFF0C\u6216\u653E\u5F03\u8349\u7A3F\u540E\u91C7\u7528\u6700\u65B0\u53C2\u6570\u518D\u7F16\u8F91\u3002",
        "settings.resetDraft": "\u653E\u5F03\u8349\u7A3F\uFF0C\u91C7\u7528\u6700\u65B0\u5168\u5C40\u53C2\u6570",
        "settings.unavailable": "\u5168\u5C40\u53C2\u6570\u6682\u4E0D\u53EF\u7528\uFF0C\u8F85\u52A9\u8BF7\u6C42\u4E0E\u53C2\u6570\u4FDD\u5B58\u5DF2\u6682\u505C\u3002\u8BF7\u91CD\u8BFB\u72B6\u6001\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u4FDD\u5B58\u3002",
        "settings.globalOnly": "\u8BF7\u5728\u4FA7\u680F\u201C\u63D0\u793A\u8BCD\u8F85\u52A9\u201D\u9875\u9762\u7F16\u8F91\u5168\u5C40\u53C2\u6570\uFF1B\u8FD9\u91CC\u4E0D\u518D\u4FDD\u5B58\u4F1A\u8BDD\u53C2\u6570\u3002",
        "settings.globalSection": "\u5168\u5C40\u529F\u80FD\u5F00\u5173",
        "settings.sessionSection": "\u5168\u5C40\u8F85\u52A9\u53C2\u6570",
        "settings.prioritySection": "Priority \u4F9B\u5E94\u5546\u6388\u6743\uFF08\u9AD8\u7EA7\uFF09",
        "settings.updatesSection": "\u7248\u672C\u4E0E\u66F4\u65B0",
        "settings.sessionEmpty": "\u65E0\u9700\u9009\u62E9\u4F1A\u8BDD\uFF1B\u5168\u5C40\u5F00\u5173\u3001\u6A21\u578B\u53C2\u6570\u4E0E Priority \u6388\u6743\u53EF\u76F4\u63A5\u914D\u7F6E\u3002",
        "settings.advanced": "\u9690\u79C1\u4E0E\u9650\u5236\u8BF4\u660E",
        "settings.sectionNav": "\u8BBE\u7F6E\u5206\u533A",
        "settings.nav.assist": "\u8F85\u52A9\u53C2\u6570",
        "settings.nav.priority": "Priority \u6388\u6743",
        "settings.nav.style": "\u6A21\u578B\u9009\u62E9\u5668",
        "settings.nav.update": "\u7248\u672C\u4E0E\u66F4\u65B0",
        "settings.modelStyleSection": "\u6A21\u578B\u9009\u62E9\u5668\u6837\u5F0F",
        "settings.modelStyleHint": "\u9009\u62E9\u8F93\u5165\u6846\u6A21\u578B\u9009\u62E9\u5668\u7684\u5916\u89C2\uFF1ADSH \u9ED8\u8BA4\u3001Claude Style \u6216 ZCode\uFF0C\u5207\u6362\u7ACB\u5373\u751F\u6548\u3002",
        "settings.modelStyleDsh": "DSH \u9ED8\u8BA4",
        "settings.modelStyleDshNote": "\u4F7F\u7528\u5BBF\u4E3B\u81EA\u5E26\u7684\u6A21\u578B\u9009\u62E9\u5668\uFF0C\u53EF\u89E3\u51B3\u4E0E\u4E3B\u9898\u63D2\u4EF6\u7684\u6837\u5F0F\u51B2\u7A81\u3002",
        "settings.modelStyleClaude": "Claude Style",
        "settings.modelStyleClaudeNote": "\u672C\u63D2\u4EF6\u81EA\u5E26\u7684\u81EA\u5B9A\u4E49\u9009\u62E9\u5668\uFF1A\u6309\u4F9B\u5E94\u5546\u5206\u7EC4\u3001\u53EF\u5E38\u9A7B\uFF0C\u5E95\u90E8\u4E3A\u63A8\u7406\u5F3A\u5EA6\u6ED1\u5757\u3002",
        "settings.modelStyleZcode": "ZCode",
        "settings.modelStyleZcodeNote": "\u6309 zai-org/ZCode \u79FB\u690D\uFF1A\u83DC\u5355\u5728\u6309\u94AE\u4E0A\u65B9\u5C55\u5F00\uFF0C\u4F9B\u5E94\u5546\u5B50\u83DC\u5355\u5BFC\u822A\uFF0C\u5E95\u90E8\u4E3A\u601D\u8003\u6863\u6ED1\u5757\uFF08\u6700\u9AD8\u6863\u6C14\u6CE1\u6D41\u52A8\u52A8\u6548\uFF09\u3002",
        "global.migration": "\u4FDD\u7559\u5DF2\u6709\u5168\u5C40\u5F00\u5173\uFF0C\u4F46\u4E0D\u8FC1\u79FB\u4EFB\u4E00\u65E7\u4F1A\u8BDD\u7684\u53C2\u6570\u3002\u5168\u65B0 profile \u5DF2\u5E26\u9ED8\u8BA4\u53C2\u6570\uFF08\u8DDF\u968F\u4F1A\u8BDD\u6A21\u578B\u4E0E\u63A8\u7406\u6863\uFF09\uFF0C\u5F00\u5173\u5373\u5F00\u5373\u7528\uFF1B\u65E7 profile \u82E5\u63D0\u793A\u672A\u4FDD\u5B58\u53C2\u6570\uFF0C\u8BF7\u6838\u5BF9\u5E76\u4FDD\u5B58\u4E00\u6B21\u3002\u65B0\u65E7\u4F1A\u8BDD\u5171\u540C\u4F7F\u7528\uFF1B\u4FDD\u5B58\u3001\u5F00\u542F\u6216\u91CD\u8FDE\u5747\u4E0D\u8FFD\u6EAF\u5386\u53F2\u95EE\u7B54\u3002",
        "global.loading": "\u6B63\u5728\u8BFB\u53D6\u5168\u5C40\u5F00\u5173\u5E76\u8FDE\u63A5\u540C\u6B65\u2026",
        "global.disconnected": "\u5168\u5C40\u540C\u6B65\u6682\u4E0D\u53EF\u7528\uFF1B\u4E0B\u65B9\u53EF\u80FD\u663E\u793A\u4E0A\u6B21\u786E\u8BA4\u503C\uFF0C\u4F46\u5404\u4F1A\u8BDD\u6682\u4E0D\u542F\u7528\u8F85\u52A9\u8BF7\u6C42\u3002\u6062\u590D\u8FDE\u63A5\u53EA\u91CD\u8BFB\u72B6\u6001\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u4FDD\u5B58\u3002",
        "global.saving": "\u6B63\u5728\u4FDD\u5B58\u5168\u5C40\u8BBE\u7F6E\u2026",
        "global.saved": "\u5168\u5C40\u5F00\u5173\u5DF2\u7531\u5BBF\u4E3B\u786E\u8BA4\u4FDD\u5B58\u3002",
        "global.saveFailed": "\u672A\u786E\u8BA4\u4FDD\u5B58\u6210\u529F\uFF0C\u4E0D\u80FD\u89C6\u4E3A\u5F00\u5173\u5DF2\u66F4\u6539\uFF1B\u8BF7\u91CD\u8BFB\u72B6\u6001\u540E\u624B\u52A8\u91CD\u8BD5\u3002\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u4FDD\u5B58\u3002",
        "global.stale": "\u5176\u4ED6\u7A97\u53E3\u5DF2\u66F4\u65B0\u5168\u5C40\u5F00\u5173\u3002\u672C\u6B21\u65E7\u7248\u672C\u64CD\u4F5C\u672A\u4F5C\u4E3A\u5F53\u524D\u4FDD\u5B58\u6210\u529F\u5904\u7406\uFF1B\u8BF7\u91CD\u8BFB\u5E76\u6838\u5BF9\u540E\u518D\u64CD\u4F5C\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u53D1\u4FDD\u5B58\u3002",
        "global.reload": "\u91CD\u8BFB\u5168\u5C40\u8BBE\u7F6E",
        "online.confirmationRejected": "\u5BBF\u4E3B\u660E\u786E\u62D2\u7EDD\u4E86\u672C\u6B21\u786E\u8BA4\uFF0C\u672A\u4E3A\u6B64\u8BF7\u6C42\u542F\u52A8\u66F4\u65B0\u4EFB\u52A1\u3002\u8BF7\u91CD\u65B0\u8BFB\u53D6\u72B6\u6001\uFF0C\u7136\u540E\u91CD\u65B0\u51C6\u5907\u5E76\u786E\u8BA4\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8BD5\u3002\u9519\u8BEF\u7801\uFF1A",
        "online.forgetWarning": "\u82E5\u8BB0\u5F55\u65E0\u6CD5\u6062\u590D\uFF0C\u8BF7\u5148\u5728\u63D2\u4EF6\u7BA1\u7406\u4E2D\u4EBA\u5DE5\u6838\u5BF9\u5B9E\u9645\u5B89\u88C5\u7248\u672C\u5E76\u786E\u8BA4\u6CA1\u6709\u66F4\u65B0\u4EFB\u52A1\u4ECD\u5728\u6267\u884C\u3002\u6E05\u9664\u4EC5\u79FB\u9664\u672C\u6807\u7B7E\u9875\u7684\u672C\u5730\u8DDF\u8E2A\u6807\u8BB0\uFF0C\u4E0D\u4EE3\u8868\u66F4\u65B0\u6210\u529F\uFF0C\u4E0D\u4F1A\u53D6\u6D88\u3001\u542F\u52A8\u6216\u91CD\u8BD5\u4EFB\u4F55\u5BBF\u4E3B\u4EFB\u52A1\u3002\u987B\u5148\u6210\u529F\u91CD\u8BFB\u72B6\u6001\uFF0C\u4E14\u6CA1\u6709\u6D3B\u52A8\u4EFB\u52A1\uFF0C\u624D\u80FD\u6E05\u9664\u3002",
        "online.forgetAcknowledgement": "\u6211\u5DF2\u4EBA\u5DE5\u6838\u5BF9\u5B89\u88C5\u72B6\u6001\uFF0C\u786E\u8BA4\u6CA1\u6709\u66F4\u65B0\u4EFB\u52A1\u4ECD\u5728\u6267\u884C\uFF0C\u5E76\u7406\u89E3\u6E05\u9664\u6807\u8BB0\u4E0D\u662F\u66F4\u65B0\u7ED3\u679C\u3002",
        "online.forgetMarker": "\u4EC5\u6E05\u9664\u672C\u5730\u8DDF\u8E2A\u6807\u8BB0",
        "online.markerCleared": "\u672C\u5730\u8DDF\u8E2A\u6807\u8BB0\u5DF2\u6E05\u9664\uFF0C\u5BBF\u4E3B\u4EFB\u52A1\u672A\u88AB\u66F4\u6539\uFF0C\u66F4\u65B0\u6210\u529F\u4E0E\u5426\u4ECD\u4E0D\u7531\u6B64\u786E\u5B9A\u3002\u8BF7\u91CD\u8BFB\u72B6\u6001\uFF1B\u5982\u9700\u66F4\u65B0\uFF0C\u5FC5\u987B\u91CD\u65B0\u51C6\u5907\u3001\u52FE\u9009\u98CE\u9669\u786E\u8BA4\u5E76\u63D0\u4EA4\u3002",
        "online.title": "\u5728\u7EBF\u66F4\u65B0",
        "online.installNow": "\u68C0\u67E5\u5E76\u5B89\u88C5\u66F4\u65B0",
        "online.installing": "\u6B63\u5728\u5B89\u88C5\u2026",
        "online.installConsent": "\u6211\u5DF2\u77E5\u6653\uFF1A\u5728\u7EBF\u66F4\u65B0\u4F1A\u4FEE\u6539\u672C profile\uFF0C\u53EF\u80FD\u8981\u6C42\u91CD\u542F\uFF1B\u5931\u8D25\u65F6\u9700\u6309\u8BB0\u5F55\u4EBA\u5DE5\u6062\u590D\u3002",
        "online.userOnly": "\u68C0\u67E5\u7248\u672C\u4E0D\u4F1A\u5B89\u88C5\u3002\u52FE\u9009\u98CE\u9669\u786E\u8BA4\u540E\u70B9\u51FB\u201C\u4E0B\u8F7D\u5E76\u5B89\u88C5\u201D\uFF08\u6216\u4E0B\u65B9\u7684\u4E00\u6B21\u6027\u6309\u94AE\uFF09\u624D\u4F1A\u542F\u52A8\u5BBF\u4E3B\u66F4\u65B0\u4EFB\u52A1\uFF0C\u5185\u90E8\u5148\u51C6\u5907\u518D\u63D0\u4EA4\u5B89\u88C5\u3002\u4E0D\u4F1A\u81EA\u52A8\u66F4\u65B0\u3002",
        "online.continuity": "\u66F4\u65B0\u671F\u95F4\u672C\u9875\u9762\u53EF\u80FD\u6D88\u5931\u6216\u77ED\u6682\u4E0D\u53EF\u7528\uFF1B\u5173\u95ED\u9875\u9762\u4E0D\u4F1A\u53D6\u6D88\u5BBF\u4E3B\u4EFB\u52A1\u3002\u91CD\u65B0\u6253\u5F00\u540E\u53EF\u8BFB\u53D6\u7ED3\u679C\u3002\u9000\u51FA DSH \u4F1A\u4E2D\u65AD\u4EFB\u52A1\uFF0C\u8BF7\u7B49\u5F85\u7ED3\u679C\u540E\u518D\u6309\u63D0\u793A\u91CD\u542F\u3002\u8BF7\u5148\u4FDD\u5B58\u8349\u7A3F\u5E76\u5907\u4EFD\u914D\u7F6E\u3002",
        "online.loading": "\u6B63\u5728\u8BFB\u53D6\u5BBF\u4E3B\u66F4\u65B0\u72B6\u6001\u2026",
        "online.noRecord": "\u6CA1\u6709\u53EF\u8BFB\u53D6\u7684\u5728\u7EBF\u66F4\u65B0\u4EFB\u52A1\u8BB0\u5F55\uFF1B\u8FD9\u4E0D\u4EE3\u8868\u66F4\u65B0\u6210\u529F\u3002",
        "online.unavailable": "\u5F53\u524D\u65E0\u6CD5\u51C6\u5907\u5728\u7EBF\u66F4\u65B0\u3002",
        "online.sourceObserved": "\u68C0\u6D4B\u5230\u7684\u5B89\u88C5\u6765\u6E90",
        "online.unsupportedSourceHint": "\u5728\u7EBF\u66F4\u65B0\u53EA\u652F\u6301\u4ECE\u5B98\u65B9\u65E0\u7248\u672C\u53F7\u5730\u5740\u5B89\u88C5\u7684\u63D2\u4EF6\u3002\u8BF7\u5728\u300C\u63D2\u4EF6\u300D\u9875\u79FB\u9664\u672C\u63D2\u4EF6\uFF0C\u518D\u7528 github:Syngnat/dsh-prompt-assist \u91CD\u65B0\u5B89\u88C5\uFF1B\u5347\u7EA7\u524D\u5148\u4FDD\u5B58\u8349\u7A3F\u5E76\u5907\u4EFD\u914D\u7F6E\u3002",
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
        "online.taskFrom": "\u4EFB\u52A1\u539F\u7248\u672C",
        "online.taskTarget": "\u4EFB\u52A1\u76EE\u6807\u7248\u672C",
        "online.runningVersion": "\u5F53\u524D\u8FD0\u884C\u7248\u672C",
        "online.recordStale": "\u8FD9\u662F\u66F4\u65E9\u7684\u66F4\u65B0\u4EFB\u52A1\u8BB0\u5F55\uFF0C\u4E0D\u4EE3\u8868\u5F53\u524D\u7248\u672C\uFF1B\u4E0B\u65B9\u4F9D\u6B21\u662F\u5F53\u524D\u8FD0\u884C\u7248\u672C / \u8BB0\u5F55\u5185\u5DF2\u9A8C\u8BC1\u7248\u672C\u3002",
        "online.history": "\u5386\u53F2\u66F4\u65B0\u8BB0\u5F55",
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
        "updates.readOnly": "\u7248\u672C\u68C0\u67E5\u53EA\u8BFB\u53D6\u516C\u5F00\u4FE1\u606F\uFF0C\u4E0D\u4E0B\u8F7D\u6216\u5B89\u88C5\u3002\u68C0\u6D4B\u5230\u65B0\u7248\u540E\u53EF\u5728\u6B64\u52FE\u9009\u98CE\u9669\u786E\u8BA4\u5E76\u76F4\u63A5\u5B89\u88C5\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u5347\u7EA7\u3002",
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
        "priority.scope": "Fast \u901A\u8FC7\u8BF7\u6C42\u7EA7 service_tier \u751F\u6548\uFF0C\u5C5E\u4E8E\u63A5\u5165\u70B9\u80FD\u529B\uFF0C\u4E0D\u662F\u6A21\u578B\u540D\u5B57\u7684\u5C5E\u6027\u3002\u9ED8\u8BA4\u4EC5\u6388\u6743 openai\u3001openai-codex\u3001cpa\uFF1B\u4E0B\u9762\u53EA\u80FD\u6388\u6743\u5DF2\u6CE8\u518C\u4E14\u786E\u5B9E\u63D0\u4F9B\u53D7\u652F\u6301\u52A0\u901F\u6A21\u578B\u7684\u4F9B\u5E94\u5546\uFF1AOpenAI gpt/o \u7CFB\u5217\uFF0C\u6216 xAI Grok 4 \u53CA\u4EE5\u4E0A\u3002\u8D39\u7528\u7531\u670D\u52A1\u5546\u6309\u5B9E\u9645\u6863\u4F4D\u8BA1\u6536\u2014\u2014xAI Priority \u4E3A 2\xD7 \u6807\u51C6\u4EF7\u2014\u2014DSH \u8D39\u7528\u4F30\u7B97\u4E0D\u4FDD\u8BC1\u53CD\u6620 Priority \u6EA2\u4EF7\uFF0C\u8BF7\u4EE5\u670D\u52A1\u5546\u8D26\u5355\u4E3A\u51C6\u3002",
        "priority.configured": "\u5185\u7F6E\u6388\u6743",
        "priority.authorized": "\u5DF2\u81EA\u52A9\u6388\u6743",
        "priority.none": "\u5C1A\u672A\u81EA\u52A9\u6388\u6743\u5176\u4ED6\u4F9B\u5E94\u5546\u3002",
        "priority.candidates": "\u53EF\u6388\u6743\u4F9B\u5E94\u5546",
        "priority.choose": "\u8BF7\u9009\u62E9\u4F9B\u5E94\u5546",
        "priority.noCandidates": "\u6CA1\u6709\u5176\u4ED6\u53EF\u6388\u6743\u4F9B\u5E94\u5546\uFF1A\u672A\u6CE8\u518C\uFF0C\u6216\u672A\u63D0\u4F9B\u53D7\u652F\u6301\u7684\u52A0\u901F\u6A21\u578B\u3002",
        "priority.allAuthorized": "\u5F53\u524D\u6240\u6709\u63D0\u4F9B\u53D7\u652F\u6301\u52A0\u901F\u6A21\u578B\u7684\u4F9B\u5E94\u5546\u90FD\u5DF2\u5728\u5185\u7F6E\u6388\u6743\u4E2D\uFF0C\u65E0\u9700\u518D\u6B21\u6388\u6743\u3002\u82E5\u4F60\u8981\u7528\u7684\u662F\u5176\u4ED6\u63A5\u5165\u70B9\uFF0C\u8BF7\u5148\u5728\u63D2\u4EF6\u8BBE\u7F6E\u4E2D\u914D\u7F6E\u8BE5\u4F9B\u5E94\u5546\uFF0C\u786E\u8BA4\u5B83\u7684\u6A21\u578B\u76EE\u5F55\u91CC\u5B58\u5728\u8FD9\u7C7B\u6A21\u578B\uFF08OpenAI gpt/o \u7CFB\u5217\u6216 xAI Grok 4+\uFF09\uFF0C\u518D\u70B9\u51FB\u201C\u91CD\u65B0\u8BFB\u53D6\u6388\u6743\u201D\u3002",
        "priority.noProviderModels": "\u5F53\u524D\u6CA1\u6709\u5DF2\u6CE8\u518C\u4E14\u63D0\u4F9B\u53D7\u652F\u6301\u52A0\u901F\u6A21\u578B\u7684\u4F9B\u5E94\u5546\u3002\u8BF7\u5148\u914D\u7F6E\u4F9B\u5E94\u5546\u4E0E\u6A21\u578B\uFF0C\u518D\u56DE\u5230\u8FD9\u91CC\u70B9\u51FB\u201C\u91CD\u65B0\u8BFB\u53D6\u6388\u6743\u201D\u3002",
        "priority.visibleModels": "\u53EF\u8BC6\u522B\u7684\u52A0\u901F\u6A21\u578B",
        "priority.exampleModels": "\u793A\u4F8B\u6A21\u578B",
        "priority.consent": "\u6211\u786E\u8BA4\u8BE5\u63A5\u5165\u70B9\u652F\u6301 Priority\uFF0C\u53EF\u80FD\u4EA7\u751F\u989D\u5916\u8D39\u7528\uFF0C\u5E76\u540C\u610F\u628A\u5B83\u52A0\u5165\u672C profile \u7684 Priority \u5141\u8BB8\u540D\u5355\u3002",
        "priority.authorize": "\u6388\u6743",
        "priority.revoke": "\u64A4\u9500\u6388\u6743",
        "priority.reload": "\u91CD\u65B0\u8BFB\u53D6\u6388\u6743",
        "priority.loading": "\u6B63\u5728\u8BFB\u53D6\u4F9B\u5E94\u5546\u6388\u6743\u2026",
        "priority.stale": "\u5176\u4ED6\u7A97\u53E3\u5DF2\u4FEE\u6539\u6388\u6743\u540D\u5355\u3002\u5DF2\u91CD\u65B0\u8BFB\u53D6\uFF0C\u8BF7\u786E\u8BA4\u540E\u91CD\u8BD5\u3002",
        "priority.refused": "\u8BE5\u4F9B\u5E94\u5546\u4E0D\u80FD\u88AB\u6388\u6743\uFF1A\u672A\u6CE8\u518C\uFF0C\u6216\u6CA1\u6709\u53D7\u652F\u6301\u7684\u52A0\u901F\u6A21\u578B\uFF08OpenAI gpt/o \u7CFB\u5217\u6216 xAI Grok 4+\uFF09\u3002",
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
        "updates.installNow": "\u4E0B\u8F7D\u5E76\u5B89\u88C5",
        "updates.installing": "\u6B63\u5728\u5B89\u88C5\u2026",
        "updates.installConsent": "\u6211\u5DF2\u77E5\u6653\uFF1A\u5728\u7EBF\u66F4\u65B0\u4F1A\u4FEE\u6539\u672C profile\uFF0C\u53EF\u80FD\u8981\u6C42\u91CD\u542F",
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
        chooseSession: "\u65E0\u9700\u9009\u62E9\u4F1A\u8BDD\uFF0C\u53EF\u76F4\u63A5\u7F16\u8F91\u5F53\u524D profile \u7684\u5168\u5C40\u8F85\u52A9\u53C2\u6570\u3002",
        returnConversation: "\u8FD4\u56DE\u5BF9\u8BDD",
        sessionScope: "\u6A21\u578B\u3001\u63A8\u7406\u6863\u3001\u8F85\u52A9 Fast \u548C\u8F6E\u6570\u5747\u6309\u529F\u80FD\u5728\u5F53\u524D profile \u5168\u5C40\u4FDD\u5B58\uFF1B\u8DDF\u968F\u4F1A\u8BDD\u5728\u8FD0\u884C\u65F6\u89E3\u6790\u3002",
        editingSession: "\u53EF\u9009\u7684\u5F53\u524D\u4F1A\u8BDD",
        loading: "\u6B63\u5728\u52A0\u8F7D\u8BBE\u7F6E\u2026",
        generatingSuggest: "\u6B63\u5728\u5EFA\u8BAE\u2026",
        enableSuggest: "\u8BF7\u5728\u63D0\u793A\u8BCD\u8F85\u52A9\u4E2D\u4FDD\u5B58\u5168\u5C40\u5EFA\u8BAE\u53C2\u6570\uFF0C\u5E76\u5F00\u542F\u5F53\u524D profile \u7684\u4E0B\u4E00\u95EE\u5EFA\u8BAE\u5F00\u5173\u3002",
        suggestReset: "\u8F93\u5165\u6216\u914D\u7F6E\u53D1\u751F\u53D8\u5316\uFF0C\u672C\u8F6E\u81EA\u52A8\u5EFA\u8BAE\u5DF2\u53D6\u6D88\uFF1B\u53EF\u624B\u52A8\u91CD\u65B0\u751F\u6210\u3002",
        suggestRequested: "\u672C\u8F6E\u5DF2\u89E6\u53D1\u8FC7\u5EFA\u8BAE\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u590D\u8BF7\u6C42\uFF1B\u9700\u8981\u65F6\u53EF\u624B\u52A8\u91CD\u8BD5\u3002",
        streaming: "\u6B63\u5728\u6D41\u5F0F\u751F\u6210\uFF0C\u5B8C\u6210\u540E\u53EF\u5E94\u7528",
        generateSuggest: "\u751F\u6210\u4E0B\u4E00\u95EE\u5EFA\u8BAE",
        suggestDisabled: "\u81EA\u52A8\u5EFA\u8BAE\u5C1A\u672A\u542F\u7528\u3002",
        draftOccupied: "\u8349\u7A3F\u542B\u6587\u5B57\u3001\u5F15\u7528\u6216\u9644\u4EF6\uFF0C\u81EA\u52A8\u5EFA\u8BAE\u5DF2\u8DF3\u8FC7\uFF0C\u4E0D\u4F1A\u8986\u76D6\u8F93\u5165\u3002",
        waitingQA: "\u81EA\u52A8\u7B49\u5F85\u4E0B\u4E00\u8F6E\u5B8C\u6574 QA\uFF1B\u4E5F\u53EF\u70B9\u51FB\u4E0B\u65B9\u6309\u94AE\uFF0C\u57FA\u4E8E\u5DF2\u6709 QA \u751F\u6210\u3002",
        enhancing: "\u6B63\u5728\u589E\u5F3A\u2026",
        enableEnhance: "\u8BF7\u5728\u5168\u5C40\u9875\u9762\u4FDD\u5B58\u589E\u5F3A\u53C2\u6570\uFF0C\u5E76\u5F00\u542F\u5F53\u524D profile \u7684\u589E\u5F3A\u5F00\u5173\u3002",
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
        "picker.fallback": "\u9009\u62E9\u6A21\u578B",
        "picker.loading": "\u6B63\u5728\u52A0\u8F7D\u6A21\u578B\u2026",
        "picker.empty": "\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B\u3002",
        "picker.failed": "\u6A21\u578B\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
        "picker.sessionInUse": "\u8BE5\u4F1A\u8BDD\u6B63\u5728\u88AB\u5176\u4ED6 DSH \u5B9E\u4F8B\u4F7F\u7528\uFF0C\u8BF7\u5173\u95ED\u5176\u4ED6\u5B9E\u4F8B\u540E\u91CD\u8BD5\u3002",
        "picker.effort": "\u63A8\u7406\u5F3A\u5EA6",
        "picker.providerDefault": "\u670D\u52A1\u5546\u9ED8\u8BA4",
        "picker.aria": "\u6A21\u578B\u9009\u62E9\u5668",
        "picker.ariaCurrent": "\u9009\u62E9\u6A21\u578B\uFF0C\u5F53\u524D {model}",
        "picker.models": "\u6309\u4F9B\u5E94\u5546\u5206\u7EC4\u7684\u6A21\u578B",
        "picker.account": "DeepSeek \u8D26\u6237",
        "picker.saving": "\u6B63\u5728\u5207\u6362\u2026",
        "picker.otherModels": "\u5176\u4F59\u6A21\u578B",
        "picker.otherRow": "\u5176\u4F59\u6A21\u578B\uFF1A{count} \u4E2A",
        "picker.pin": "\u5E38\u9A7B\u663E\u793A\uFF0C\u53EF\u540C\u65F6\u5E38\u9A7B\u591A\u4E2A\uFF0C\u5176\u4F59\u6536\u8FDB\u540C\u4E00\u5206\u7EC4",
        "picker.unpin": "\u53D6\u6D88\u5E38\u9A7B",
        "picker.pinMark": "\u5E38\u9A7B",
        "picker.pinnedMark": "\u5DF2\u5E38\u9A7B",
        "picker.groupFailed": "{name} \u7684\u6A21\u578B\u76EE\u5F55\u52A0\u8F7D\u5931\u8D25\uFF1A{message}",
        "picker.loadFailed": "\u6A21\u578B\u76EE\u5F55\u52A0\u8F7D\u5931\u8D25\uFF1A{message}",
        "picker.retry": "\u91CD\u65B0\u52A0\u8F7D",
        "picker.effortUnavailable": "\u5F53\u524D\u6863\u4F4D\u4E0D\u5728\u53EF\u9009\u5217\u8868\u4E2D",
        "picker.level.none": "\u5173\u95ED",
        "picker.level.minimal": "\u6700\u4F4E",
        "picker.back": "\u8FD4\u56DE",
        "picker.providerSwitch": "\u5207\u6362\u4F9B\u5E94\u5546\uFF0C\u53E6\u6709 {count} \u4E2A",
        "picker.providerModels": "{count} \u4E2A\u6A21\u578B",
        "picker.providerCount": "{count} \u4E2A\u4F9B\u5E94\u5546",
        "picker.level.low": "\u4F4E",
        "picker.level.medium": "\u4E2D",
        "picker.level.high": "\u9AD8",
        "picker.level.xhigh": "\u8D85\u9AD8",
        "picker.level.max": "\u6700\u9AD8",
        "picker.faster": "\u66F4\u5FEB",
        "picker.smarter": "\u66F4\u5F3A",
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
        initial: "\u8BF7\u5148\u6838\u5BF9\u5E76\u4FDD\u5B58\u5168\u5C40\u8F85\u52A9\u53C2\u6570\u3002\u5EFA\u8BAE\u4EC5\u5728\u65B0\u7684\u5B8C\u6574\u95EE\u7B54\u7ED3\u675F\u540E\u751F\u6210\uFF0C\u9996\u6B21\u6253\u5F00\u3001\u4FDD\u5B58\u3001\u542F\u7528\u6216\u91CD\u8FDE\u5747\u4E0D\u8FFD\u6EAF\u3002",
        manual: "\u589E\u5F3A\u53EA\u5728\u70B9\u51FB\u540E\u8BF7\u6C42\uFF1B\u751F\u6210\u671F\u95F4\u4ECD\u53EF\u7F16\u8F91\uFF0C\u7F16\u8F91\u4F1A\u53D6\u6D88\u8FC7\u671F\u7ED3\u679C\u3002",
        busy: "\u4F1A\u8BDD\u4ECD\u5728\u8FD0\u884C\uFF0C\u7ED3\u675F\u540E\u518D\u8BD5\u3002",
        requestError: "\u8BF7\u6C42\u672A\u5B8C\u6210\uFF0C\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\uFF1B\u8BF7\u68C0\u67E5\u914D\u7F6E\u540E\u91CD\u8BD5\u3002",
        fastSkipped: "\u5F53\u524D\u6A21\u578B\u4E0D\u652F\u6301\u8F85\u52A9 Fast\uFF0C\u672C\u6B21\u6309\u666E\u901A\u8BF7\u6C42\u6267\u884C\uFF0C\u672A\u542F\u7528 Priority\uFF1B\u5DF2\u4FDD\u5B58\u7684 Fast \u8BBE\u7F6E\u4FDD\u6301\u4E0D\u53D8\u3002",
        emptyResult: "\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u53EF\u7528\u6587\u672C\uFF0C\u672A\u5E94\u7528\u7ED3\u679C\uFF1B\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002\u53EF\u91CD\u8BD5\uFF0C\u6216\u964D\u4F4E\u63A8\u7406\u6863\u540E\u91CD\u8BD5\u3002",
        enhanceUnchanged: "\u6A21\u578B\u8FD4\u56DE\u4E86\u76F8\u540C\u6587\u672C\uFF0C\u672A\u4EA7\u751F\u6709\u6548\u6539\u5199\uFF1B\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002\u8BF7\u5C1D\u8BD5\u5176\u4ED6\u6A21\u578B\u6216\u8C03\u6574\u8981\u6C42\u3002",
        cancelled: "\u672C\u6B21\u751F\u6210\u5DF2\u53D6\u6D88\uFF0C\u672A\u5E94\u7528\u7ED3\u679C\uFF1B\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002",
        modelFailed: "\u6A21\u578B\u8BF7\u6C42\u5931\u8D25\uFF0C\u4F46\u672A\u53D6\u5F97\u53EF\u8BC6\u522B\u7684\u5177\u4F53\u539F\u56E0\uFF1B\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\uFF0C\u672A\u81EA\u52A8\u91CD\u8BD5\u3002\u8BF7\u6838\u5BF9\u8BE5\u6A21\u578B\u63A5\u5165\u70B9\u7684\u72B6\u6001\u3002",
        providerRejected: "\u6A21\u578B\u670D\u52A1\u62D2\u7EDD\u4E86\u672C\u6B21\u8BF7\u6C42\uFF1B\u8BF7\u6838\u5BF9\u8BE5\u63A5\u5165\u70B9\u7684\u6A21\u578B\u53C2\u6570\u548C\u9650\u5236\u3002\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\uFF0C\u672A\u81EA\u52A8\u91CD\u8BD5\u3002",
        providerAccessDenied: "\u6A21\u578B\u670D\u52A1\u62D2\u7EDD\u8BBF\u95EE\uFF1B\u8BF7\u5728\u670D\u52A1\u5546\u914D\u7F6E\u4E2D\u68C0\u67E5\u8BA4\u8BC1\u3001\u6A21\u578B\u6743\u9650\u6216\u8D26\u6237\u72B6\u6001\u3002\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002",
        providerRateLimited: "\u6A21\u578B\u670D\u52A1\u8FD4\u56DE\u9650\u6D41\u6216\u989D\u5EA6\u9650\u5236\uFF1B\u8BF7\u68C0\u67E5\u670D\u52A1\u5546\u72B6\u6001\uFF0C\u6216\u7A0D\u540E\u624B\u52A8\u91CD\u8BD5\u3002\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002",
        providerQuota: "\u6A21\u578B\u670D\u52A1\u62A5\u544A\u8D26\u6237\u914D\u989D\u6216\u989D\u5EA6\u4E0D\u8DB3\uFF1B\u8BF7\u68C0\u67E5\u8BE5\u670D\u52A1\u5546\u8D26\u6237\u72B6\u6001\u3002\u672A\u81EA\u52A8\u91CD\u8BD5\uFF0C\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002",
        providerTimeout: "\u6A21\u578B\u670D\u52A1\u6216\u7F51\u5173\u62A5\u544A\u7B49\u5F85\u8D85\u65F6\uFF1B\u8FD9\u4E0E\u8F85\u52A9\u8BF7\u6C42\u81EA\u8EAB\u7684\u7B49\u5F85\u622A\u6B62\u4E0D\u540C\u3002\u672A\u81EA\u52A8\u91CD\u8BD5\uFF0C\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002",
        providerRequestTooLarge: "\u6A21\u578B\u63A5\u5165\u70B9\u62D2\u7EDD\u4E86\u8BF7\u6C42\u5927\u5C0F\uFF1B\u9700\u6838\u5BF9\u5B8C\u6574\u8BF7\u6C42\uFF08\u542B\u7CFB\u7EDF\u63D0\u793A\u548C\u6240\u9009 QA\uFF09\u7684\u9650\u5236\uFF0C\u800C\u4E0D\u53EA\u662F\u539F\u6587\u5B57\u6570\u3002\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002",
        providerUnavailable: "\u6A21\u578B\u670D\u52A1\u6216\u7F51\u5173\u8FD4\u56DE\u670D\u52A1\u5F02\u5E38\uFF1B\u672A\u81EA\u52A8\u91CD\u8BD5\uFF0C\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002",
        providerTransport: "\u8FDE\u63A5\u6A21\u578B\u670D\u52A1\u65F6\u53D1\u751F\u4F20\u8F93\u6545\u969C\uFF1B\u672A\u53D6\u5F97\u5B8C\u6574\u7ED3\u679C\uFF0C\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002",
        providerStreamIncomplete: "\u6A21\u578B\u54CD\u5E94\u6D41\u672A\u6B63\u5E38\u7ED3\u675F\uFF1B\u672A\u5E94\u7528\u4E0D\u5B8C\u6574\u5185\u5BB9\uFF0C\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002",
        providerResponseInvalid: "\u6A21\u578B\u63A5\u5165\u70B9\u8FD4\u56DE\u4E86\u4E0D\u517C\u5BB9\u6216\u65E0\u6548\u7684\u54CD\u5E94\uFF1B\u672A\u5E94\u7528\u7ED3\u679C\uFF0C\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\u3002",
        providerResponseError: "\u6A21\u578B\u9002\u914D\u5668\u62A5\u544A\u672A\u5206\u7C7B\u7684\u54CD\u5E94\u9519\u8BEF\uFF1B\u4E0D\u80FD\u636E\u6B64\u8BA4\u5B9A\u8D85\u65F6\u6216\u8D85\u9650\u3002\u8349\u7A3F\u4FDD\u6301\u4E0D\u53D8\uFF0C\u672A\u81EA\u52A8\u91CD\u8BD5\u3002",
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
        budgetPolicy: "\u8F93\u5165\u4E0A\u4E0B\u6587\u548C\u8F93\u51FA\u9884\u7B97\u8DDF\u968F\u6240\u9009\u4F9B\u5E94\u5546\u6A21\u578B\u8BBE\u7F6E\uFF1B\u672A\u914D\u7F6E\u8F93\u51FA\u9884\u7B97\u65F6\u6CBF\u7528\u5BBF\u4E3B/\u4F9B\u5E94\u5546\u9ED8\u8BA4\u884C\u4E3A\u3002\u8F83\u5927\u9884\u7B97\u53EF\u80FD\u589E\u52A0\u8017\u65F6\u548C\u8D39\u7528\uFF1B120 \u79D2\u8BF7\u6C42\u622A\u6B62\u4F1A\u53D1\u51FA\u53D6\u6D88\u4FE1\u53F7\uFF0C\u5B9E\u9645\u505C\u6B62\u53D6\u51B3\u4E8E\u9002\u914D\u5668\u54CD\u5E94\uFF1B\u6587\u4EF6\u8BFB\u53D6\u5B89\u5168\u9650\u5236\u72EC\u7ACB\u4FDD\u7559\u3002\u4E0D\u6539\u53D8\u4E3B\u4F1A\u8BDD\u53C2\u6570\u3002",
        contextUnknown: "\u65E0\u6CD5\u8BFB\u53D6\u6A21\u578B\u4E0A\u4E0B\u6587\u7A97\u53E3\u6216\u5BBF\u4E3B token \u8BA1\u91CF\u670D\u52A1\uFF0C\u672A\u53D1\u8D77\u751F\u6210\u8BF7\u6C42\u3002\u8BF7\u68C0\u67E5\u4F9B\u5E94\u5546\u6A21\u578B\u914D\u7F6E\u4E0E\u5BBF\u4E3B\u517C\u5BB9\u6027\u3002",
        requestTimeout: "\u8F85\u52A9\u8BF7\u6C42\u8FBE\u5230\u7B49\u5F85\u4E0A\u9650\uFF0C\u672A\u5E94\u7528\u7ED3\u679C\uFF1B\u539F\u6587\u4FDD\u6301\u4E0D\u53D8\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8BD5\u3002\u8BF7\u68C0\u67E5\u6A21\u578B\u54CD\u5E94\u901F\u5EA6\u6216\u63A8\u7406\u8BBE\u7F6E\u3002",
        budget: "\u672C\u6B21\u8BF7\u6C42\u8F93\u51FA\u9884\u7B97 {{tokens}} token\uFF0C\u6700\u957F\u7B49\u5F85 {{seconds}} \u79D2\uFF1B\u63A8\u7406\u53EF\u80FD\u5360\u7528\u8F93\u51FA\u9884\u7B97\uFF0C\u4E0D\u81EA\u52A8\u91CD\u8BD5\u6216\u8C03\u6863\u3002",
        outputLimit: "\u6A21\u578B\u5DF2\u8FBE\u5230\u672C\u6B21\u8F93\u51FA\u9884\u7B97\uFF0C\u7ED3\u679C\u672A\u5E94\u7528\uFF1B\u4E0D\u4F1A\u81EA\u52A8\u91CD\u8BD5\u6216\u8C03\u6574\u63A8\u7406\u6863\u3002",
        cached: "\u547D\u4E2D\u672C\u4F1A\u8BDD\u7F13\u5B58\uFF0C\u4E0B\u5217\u8017\u65F6\u4E3A\u539F\u751F\u6210\u8017\u65F6\u3002"
      },
      en: {
        "global.finalAnswer": "Closing contract",
        "global.finalAnswerHint": "Injects a Codex-style closing contract once per session: conclusions only, 10 lines max by default; re-injected after a compaction.",
        "global.title": "Profile-wide feature switches",
        "global.scope": "Switches and each feature\u2019s independent model, effort, auxiliary Fast and Q&A rounds apply to every existing and new session in this profile. No selected session is required. Main-session Fast is unchanged.",
        "global.charge": "Enabling next-question suggestions can automatically call a model and incur charges after a new complete Q&A when a session is idle with an empty draft. Enhancement still requires a click. Turning a feature off invalidates its pending results.",
        "global.suggest": "Enable suggestions across this profile",
        "global.enhance": "Enable enhancement across this profile",
        "global.suggestHint": "Requests a next question automatically after a new complete Q&A, when the session is idle with an empty draft.",
        "global.enhanceHint": "Requests only when you click Enhance. Nothing runs automatically.",
        "settings.subtitle": "Profile-wide switches, independent auxiliary models and rounds, Priority authorization and updates. No session selection is needed.",
        "settings.open": "Open settings",
        "settings.profileSection": "Profile-wide auxiliary settings",
        "settings.hostUpgrade": "The Host does not provide global model settings yet. Settings saves and auxiliary requests are disabled for safety. Update and restart the Host, then reload; old session settings are never used instead.",
        "profileScope": "Each feature saves its own model, effort, auxiliary Fast and Q&A rounds for every session. Follow session is saved globally and resolves the calling session\u2019s model at runtime.",
        "settings.profileEmpty": "Global settings have not loaded. Configure them here when connected; opening a session is not required.",
        "settings.unconfigured": "This feature has no saved global settings. Old session settings are not migrated. Review and save once before its enabled switch can take effect.",
        "settings.modelUnknown": "Model capabilities are unknown here: the calling session\u2019s model and effort resolve at runtime. You can still save global settings; auxiliary Fast applies only on supported routes.",
        "settings.stale": "Another window changed global settings. Your draft and original revision are preserved; nothing remote was overwritten. Reload and review, or discard the draft and edit the latest settings.",
        "settings.resetDraft": "Discard draft and use latest global settings",
        "settings.unavailable": "Global settings are unavailable. Auxiliary requests and settings saves are paused. Reload status; saves are never resent automatically.",
        "settings.globalOnly": "Edit profile-wide settings in Prompt assist in the sidebar. This surface no longer saves session parameters.",
        "settings.globalSection": "Global feature switches",
        "settings.sessionSection": "Profile-wide auxiliary settings",
        "settings.prioritySection": "Priority provider authorization (advanced)",
        "settings.updatesSection": "Version and updates",
        "settings.sessionEmpty": "No session selection is needed. Configure global switches, model settings and Priority authorization here.",
        "settings.advanced": "Privacy and limits",
        "settings.sectionNav": "Settings sections",
        "settings.nav.assist": "Assist settings",
        "settings.nav.priority": "Priority",
        "settings.nav.style": "Model picker",
        "settings.nav.update": "Version and updates",
        "settings.modelStyleSection": "Model picker style",
        "settings.modelStyleHint": "Pick the composer model picker look: DSH default, Claude Style or ZCode; the change applies immediately.",
        "settings.modelStyleDsh": "DSH default",
        "settings.modelStyleDshNote": "Use the host's own model picker; resolves style conflicts with theme plugins.",
        "settings.modelStyleClaude": "Claude Style",
        "settings.modelStyleClaudeNote": "The custom picker shipped with this plugin: providers grouped and pinnable, reasoning slider at the bottom.",
        "settings.modelStyleZcode": "ZCode",
        "settings.modelStyleZcodeNote": "Ported from zai-org/ZCode: the menu opens above the button with provider navigation and a thought-effort slider (flowing bubbles at the strongest level).",
        "global.migration": "Existing global switches are retained, but no old session\u2019s settings are migrated. A fresh profile ships with working defaults (follow the session\u2019s model and effort), so its switches work right away; an older profile that still reports unsaved settings needs one review and save. Saving, enabling or reconnecting never replays historical Q&A.",
        "global.loading": "Reading global switches and connecting live updates\u2026",
        "global.disconnected": "Global sync is unavailable. The last confirmed values may remain visible, but auxiliary requests are temporarily disabled in sessions. Reconnection only reads status; it never resends a save.",
        "global.saving": "Saving global settings\u2026",
        "global.saved": "The Host confirmed that the profile-wide switch was saved.",
        "global.saveFailed": "The save was not confirmed. Do not assume the switch changed. Reload status before retrying manually; saves are never retried automatically.",
        "global.stale": "Another window changed the switches. This older operation is not reported as the current successful save. Reload and review before acting; no save is resent automatically.",
        "global.reload": "Reload global settings",
        "online.confirmationRejected": "The Host explicitly rejected this confirmation without starting an update job for it. Reload status, then prepare and confirm again. Nothing retries automatically. Error code:",
        "online.forgetWarning": "If the record cannot be recovered, first verify the installed version in plugin management and make sure no update job is still running. Clearing only removes this tab\u2019s local tracking marker. It does not mean success, and does not cancel, start, or retry any Host job. Reload status successfully with no active job before clearing.",
        "online.forgetAcknowledgement": "I have manually verified the installation and that no update job is still running. I understand that clearing the marker is not an update result.",
        "online.forgetMarker": "Clear local tracking marker only",
        "online.markerCleared": "The local tracking marker was cleared. No Host job was changed, and this does not establish success. Reload status; any update still requires fresh preparation, risk consent, and confirmation.",
        "online.title": "Online update",
        "online.installNow": "Check and install update",
        "online.installing": "Installing\u2026",
        "online.installConsent": "I understand the online update modifies this profile, may require a restart, and a failed install needs manual recovery from the record.",
        "online.userOnly": "Checking versions never installs anything. Ticking the risk confirmation and clicking Download and install (or the one-click button below) starts a Host update job, which prepares first and then submits the install. Updates are never automatic.",
        "online.continuity": "This page may disappear or become temporarily unavailable during the update. Closing it does not cancel the Host job. Reopen it to read the result. Quitting DSH interrupts the job; wait for its outcome before restarting as instructed. Save drafts and back up configuration first.",
        "online.loading": "Reading Host update status\u2026",
        "online.noRecord": "No online update job record is available. This does not mean an update succeeded.",
        "online.unavailable": "Online update preparation is currently unavailable.",
        "online.sourceObserved": "Detected installation source",
        "online.unsupportedSourceHint": "Online update only supports a plugin installed from the official unversioned target. Remove this plugin in Plugins, reinstall it with github:Syngnat/dsh-prompt-assist, then update online. Save drafts and back up configuration first.",
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
        "online.taskFrom": "Task original version",
        "online.taskTarget": "Task target version",
        "online.runningVersion": "Currently running version",
        "online.recordStale": "This is a record from an earlier update task and does not describe the running version. The codes below are the running version / the version that task verified.",
        "online.history": "Earlier update record",
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
        "updates.readOnly": "Version checks only read public information; they never download or install. When a newer stable release is found you can tick the risk confirmation here and install directly. Nothing upgrades automatically.",
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
        "priority.scope": "Fast works through the request-level service_tier, which is an endpoint capability rather than a property of the model name. Only openai, openai-codex and cpa are authorized by default; this section can authorize another provider only when it is registered and actually offers a supported accelerated model: the OpenAI gpt/o families, or xAI Grok 4 and later. The provider bills by the tier actually used \u2014 xAI Priority costs 2\xD7 the standard rate \u2014 and DSH cost estimates may not reflect the Priority surcharge; use the provider bill as the source of truth.",
        "priority.configured": "Configured by the package",
        "priority.authorized": "Authorized here",
        "priority.none": "No additional provider is authorized yet.",
        "priority.candidates": "Providers that may be authorized",
        "priority.choose": "Choose a provider",
        "priority.noCandidates": "No other provider can be authorized: it is not registered or offers no supported accelerated model.",
        "priority.allAuthorized": "Every provider that offers a supported accelerated model is already authorized by the package, so there is nothing to add. To use another endpoint, configure that provider and make sure its model catalog lists such a model (OpenAI gpt/o, or xAI Grok 4+), then choose Reload authorization.",
        "priority.noProviderModels": "No registered provider currently offers a supported accelerated model. Configure a provider and model first, then choose Reload authorization here.",
        "priority.visibleModels": "Recognized accelerated models",
        "priority.exampleModels": "Example models",
        "priority.consent": "I confirm this endpoint supports Priority, that extra charges may apply, and that it joins this profile's Priority allowlist.",
        "priority.authorize": "Authorize",
        "priority.revoke": "Revoke",
        "priority.reload": "Reload authorization",
        "priority.loading": "Reading provider authorization\u2026",
        "priority.stale": "Another window changed the allowlist. It was reloaded; review it and try again.",
        "priority.refused": "This provider cannot be authorized: it is not registered or offers no supported accelerated model (OpenAI gpt/o, or xAI Grok 4+).",
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
        "updates.installNow": "Download and install",
        "updates.installing": "Installing\u2026",
        "updates.installConsent": "I understand the online update modifies this profile and may require a restart",
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
        chooseSession: "Edit profile-wide auxiliary settings without selecting a session.",
        returnConversation: "Back to conversation",
        sessionScope: "Model, effort, auxiliary Fast and rounds are saved per feature across this profile. Follow session resolves at runtime.",
        editingSession: "Optional current session",
        loading: "Loading settings\u2026",
        generatingSuggest: "Suggesting\u2026",
        enableSuggest: "Save global suggestion settings and enable the profile-wide suggestions switch in Prompt assist first.",
        suggestReset: "Input or settings changed; this automatic suggestion was cancelled. Generate manually to retry.",
        suggestRequested: "This Q&A already triggered a suggestion; no automatic duplicate. Retry manually if needed.",
        streaming: "Streaming \u2014 apply becomes available when complete",
        generateSuggest: "Generate next-question suggestion",
        suggestDisabled: "Automatic suggestions are disabled.",
        draftOccupied: "Draft has text, references or attachments. Automatic suggestions are skipped; your draft stays unchanged.",
        waitingQA: "Waiting for the next completed Q&A. You can also generate from existing Q&A below.",
        enhancing: "Enhancing\u2026",
        enableEnhance: "Save global enhancement settings and enable the profile-wide enhancement switch first.",
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
        "picker.fallback": "Select model",
        "picker.loading": "Loading models\u2026",
        "picker.empty": "No models available.",
        "picker.failed": "The model action failed. Try again.",
        "picker.sessionInUse": "This session is already in use by another DSH instance. Quit the other instance and try again.",
        "picker.effort": "Reasoning effort",
        "picker.providerDefault": "Provider default",
        "picker.aria": "Model picker",
        "picker.ariaCurrent": "Select model, currently {model}",
        "picker.models": "Models grouped by provider",
        "picker.account": "DeepSeek Account",
        "picker.saving": "Switching\u2026",
        "picker.otherModels": "Other models",
        "picker.otherRow": "Other models: {count}",
        "picker.pin": "Pin to the quick list. Several providers can stay pinned; the rest share one group",
        "picker.unpin": "Remove from quick list",
        "picker.pinMark": "Pin",
        "picker.pinnedMark": "Pinned",
        "picker.groupFailed": "Could not load {name}: {message}",
        "picker.loadFailed": "Could not load the model catalog: {message}",
        "picker.retry": "Reload",
        "picker.effortUnavailable": "Current effort is not in the available list",
        "picker.level.none": "Off",
        "picker.level.minimal": "Minimal",
        "picker.back": "Back",
        "picker.providerSwitch": "Switch provider, {count} more",
        "picker.providerModels": "{count} models",
        "picker.providerCount": "{count} providers",
        "picker.level.low": "Low",
        "picker.level.medium": "Medium",
        "picker.level.high": "High",
        "picker.level.xhigh": "Extra high",
        "picker.level.max": "Max",
        "picker.faster": "Faster",
        "picker.smarter": "Smarter",
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
        initial: "Review and save profile-wide auxiliary settings first. Suggestions only follow a NEW complete Q&A. Opening, saving, enabling or reconnecting never replays old Q&A.",
        manual: "Enhancement runs only on click. You can keep editing; edits cancel stale results.",
        busy: "The session is still running. Try again after it ends.",
        requestError: "The request did not finish. Your draft is unchanged. Check settings and retry.",
        fastSkipped: "This model does not support assist Fast, so this request ran without Priority. Your saved Fast setting is unchanged.",
        emptyResult: "The model returned no usable text, so nothing was applied. Your draft is unchanged. Retry, or lower the reasoning effort and retry.",
        enhanceUnchanged: "The model returned the same text with no effective rewrite. Your draft is unchanged. Try another model or adjust your requirements.",
        cancelled: "Generation was cancelled; nothing was applied. Your draft is unchanged.",
        modelFailed: "The model request failed without a recognized cause. Your draft is unchanged; nothing was retried automatically. Check the model endpoint status.",
        providerRejected: "The model service rejected this request. Check its model parameters and limits. Your draft is unchanged; no automatic retry.",
        providerAccessDenied: "The model service denied access. Check authentication, model permissions or account status in the provider configuration. Your draft is unchanged.",
        providerRateLimited: "The model service reported a rate or quota limit. Check provider status or retry manually later. Your draft is unchanged.",
        providerQuota: "The model service reported insufficient account quota or allowance. Check that provider account. No automatic retry; your draft is unchanged.",
        providerTimeout: "The model service or gateway reported a timeout, distinct from the auxiliary request deadline. No automatic retry; your draft is unchanged.",
        providerRequestTooLarge: "The model endpoint rejected the request size. Check the full request, including system instructions and selected QA, not only draft length. Your draft is unchanged.",
        providerUnavailable: "The model service or gateway reported a service error. No automatic retry; your draft is unchanged.",
        providerTransport: "Transport to the model service failed. No complete result was received; your draft is unchanged.",
        providerStreamIncomplete: "The model response stream did not finish normally. No partial result was applied; your draft is unchanged.",
        providerResponseInvalid: "The model endpoint returned an incompatible or invalid response. Nothing was applied; your draft is unchanged.",
        providerResponseError: "The model adapter reported an unclassified response error. This does not establish a timeout or quota issue. Your draft is unchanged; no automatic retry.",
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
        budgetPolicy: "Input context and output budgets follow the selected provider/model settings. With no configured output cap, native/provider defaults apply. Larger budgets may increase time and cost. The 120-second request deadline sends a cancellation signal; actual termination depends on the adapter. Independent file-access safeguards remain. Main conversation controls are unchanged.",
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

// assist/client/result-anchor.js
function resultHeight({ top, clipTop = 0, clipBottom, viewportHeight, scale = 1, gap = 8 }) {
  if (![top, clipTop, clipBottom, viewportHeight, scale].every(Number.isFinite) || scale <= 0 || top <= clipTop || top > clipBottom) return 0;
  const preferred = Math.min(320, Math.max(180, viewportHeight / scale * 0.38));
  const height = Math.max(0, Math.floor(Math.min(preferred, (top - clipTop) / scale - gap - 8)));
  return height >= 64 ? height : 0;
}
function measureResultAnchor(element, view) {
  const anchor = element.offsetParent;
  if (!anchor) return 0;
  const rect = anchor.getBoundingClientRect(), viewport = view.visualViewport;
  const viewportHeight = viewport?.height ?? view.innerHeight;
  let clipTop = viewport?.offsetTop ?? 0, clipBottom = clipTop + viewportHeight;
  const scale = anchor.offsetWidth > 0 ? rect.width / anchor.offsetWidth : 1;
  for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
    const style = view.getComputedStyle(parent);
    if (style.display === "contents" || !/(auto|scroll|hidden|clip)/.test(style.overflowY)) continue;
    const bounds = parent.getBoundingClientRect();
    const factor = parent.offsetHeight > 0 ? bounds.height / parent.offsetHeight : 1;
    const edge = bounds.top + (parent.clientTop ?? 0) * factor;
    clipTop = Math.max(clipTop, edge);
    clipBottom = Math.min(clipBottom, edge + parent.clientHeight * factor);
  }
  return resultHeight({ top: rect.top, clipTop, clipBottom, viewportHeight, scale });
}
function observeResultAnchor(element, view, update) {
  let frame = null, disposed = false;
  const measure = () => {
    frame = null;
    if (!disposed) update(measureResultAnchor(element, view));
  };
  const schedule = () => {
    if (!disposed && frame === null) frame = view.requestAnimationFrame(measure);
  };
  const observer = view.ResizeObserver ? new view.ResizeObserver(schedule) : null;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) observer?.observe(parent);
  view.addEventListener("resize", schedule);
  view.addEventListener("scroll", schedule, true);
  view.visualViewport?.addEventListener("resize", schedule);
  view.visualViewport?.addEventListener("scroll", schedule);
  measure();
  return () => {
    disposed = true;
    observer?.disconnect();
    if (frame !== null) view.cancelAnimationFrame(frame);
    view.removeEventListener("resize", schedule);
    view.removeEventListener("scroll", schedule, true);
    view.visualViewport?.removeEventListener("resize", schedule);
    view.visualViewport?.removeEventListener("scroll", schedule);
  };
}
function ResultAnchor({ children }) {
  const ref = import_react3.default.useRef(null), [height, setHeight] = import_react3.default.useState(320);
  useLayoutEffect(() => {
    const element = ref.current, view = element?.ownerDocument?.defaultView;
    if (element && view) return observeResultAnchor(element, view, setHeight);
  }, []);
  useLayoutEffect(() => {
    const element = ref.current, view = element?.ownerDocument?.defaultView;
    if (element && view) setHeight(measureResultAnchor(element, view));
  });
  return h3("div", { ref, className: "lpa-result-anchor", style: { "--lpa-result-height": `${height}px`, visibility: height > 0 ? "inherit" : "hidden" } }, children);
}
var import_react3, h3, useLayoutEffect;
var init_result_anchor = __esm({
  "assist/client/result-anchor.js"() {
    import_react3 = __toESM(require("react"), 1);
    h3 = import_react3.default.createElement;
    useLayoutEffect = typeof window === "undefined" ? import_react3.default.useEffect : import_react3.default.useLayoutEffect;
  }
});

// assist/client/panel-visibility.js
function shouldShowPanel({ open, result: result2, undo, input, sessionId }) {
  const preview = ownsResult(result2?.preview, sessionId);
  const actionableUndo = ownsResult(undo, sessionId) && input.draft === undo.original && input.draftRev === undo.draftRev;
  return Boolean(open || preview || ownsResult(result2?.noSuggestion, sessionId) && result2.noSuggestion.automatic !== true || result2?.pending || result2?.error || actionableUndo);
}
var init_panel_visibility = __esm({
  "assist/client/panel-visibility.js"() {
    init_editor();
  }
});

// assist/provider-failure.js
function providerHttpStatus(code2) {
  return typeof code2 === "string" && /^provider-http-[45]\d{2}$/.test(code2) ? Number(code2.slice(-3)) : null;
}
function providerErrorKey(code2) {
  if (typeof code2 === "string" && Object.hasOwn(KEYS, code2)) return KEYS[code2];
  const status = providerHttpStatus(code2);
  if (status === null) return null;
  if (status === 401 || status === 403) return "providerAccessDenied";
  if (status === 408 || status === 504) return "providerTimeout";
  if (status === 413) return "providerRequestTooLarge";
  if (status === 429) return "providerRateLimited";
  return status >= 500 ? "providerUnavailable" : "providerRejected";
}
var NATIVE_CODES, KEYS;
var init_provider_failure = __esm({
  "assist/provider-failure.js"() {
    NATIVE_CODES = Object.freeze({
      CONTEXT_WINDOW_EXCEEDED: "context-overflow",
      EMPTY_RESPONSE: "empty-result",
      QUOTA: "provider-quota",
      ACCOUNT_QUOTA: "provider-quota",
      AUTH: "provider-access-denied",
      RATE_LIMIT: "provider-rate-limited",
      INVALID_REQUEST: "provider-rejected",
      SERVER: "provider-unavailable",
      TIMEOUT: "provider-timeout",
      TRANSPORT: "provider-transport",
      STREAM_CLOSED: "provider-stream-incomplete",
      MALFORMED_RESPONSE: "provider-response-invalid",
      PI_AI_ERROR: "provider-response-error"
    });
    KEYS = Object.freeze({
      "provider-quota": "providerQuota",
      "provider-access-denied": "providerAccessDenied",
      "provider-rate-limited": "providerRateLimited",
      "provider-rejected": "providerRejected",
      "provider-unavailable": "providerUnavailable",
      "provider-timeout": "providerTimeout",
      "provider-transport": "providerTransport",
      "provider-stream-incomplete": "providerStreamIncomplete",
      "provider-response-invalid": "providerResponseInvalid",
      "provider-response-error": "providerResponseError"
    });
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
  const providerKey = providerErrorKey(code2);
  if (providerKey) return providerKey;
  if (code2 === "stale-global-settings") return "settings.stale";
  if (code2 === "global-settings-unavailable" || code2 === "global-unavailable") return "settings.unavailable";
  if (code2 === "global-save-failed") return "global.saveFailed";
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
  const status = providerHttpStatus(typeof error === "string" ? error : error?.code);
  return t(key) + (status === null ? "" : ` (HTTP ${status})`) + (key === "requestError" ? " " + t("safeCodeLabel") + " " + safeCode(error) : "");
}
var DEFAULT_SETTINGS, SESSION_FIELDS;
var init_api = __esm({
  "assist/client/api.js"() {
    init_identity();
    init_provider_failure();
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
        void generate("suggest", [], true);
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
  async function generate(feature, selectedFiles = [], automatic = false) {
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
    const ceiling = setTimeout(() => {
      if (revision === epoch && !abort.signal.aborted) {
        abort.abort();
        publish({ error: "timeout", pending: null, preview: null });
      }
    }, 135e3);
    try {
      const result2 = await deps.send("generate", sessionId, {
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
      if (!result2 || result2.draftRev !== snapshot.draftRev || result2.original !== snapshot.original || result2.feature !== feature || feature === "suggest" && result2.qaId !== qaId) {
        publish({ error: "stale", preview: null });
        return false;
      }
      const noSuggestion = result2.outcome === "no-suggestion";
      const validText = typeof result2.text === "string" && result2.text.trim() !== "";
      const validOutcome = noSuggestion ? feature === "suggest" && result2.text === "" : validText && (feature === "suggest" ? (result2.outcome === void 0 || result2.outcome === "suggestion") && !isNoSuggestionPlaceholder(result2.text) : result2.outcome === void 0);
      if (!validOutcome) {
        publish({ error: "requestError", preview: null, noSuggestion: null });
        return false;
      }
      const receipt = { ...result2, sessionId, snapshot: { ...snapshot, structured: snapshot.structured || result2.structured === true } };
      publish(noSuggestion ? { noSuggestion: { ...receipt, automatic: automatic === true }, preview: null } : { preview: receipt, noSuggestion: null });
      return true;
    } catch (error) {
      if (!disposed && !abort.signal.aborted && revision === epoch) publish({ error, preview: null });
      return false;
    } finally {
      clearTimeout(ceiling);
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
  const hasSettings = value.settings !== void 0 || value.settingsRevision !== void 0 || value.configured !== void 0;
  if (hasSettings && (!Number.isSafeInteger(value.settingsRevision) || value.settingsRevision < 0 || !value.settings || !value.configured || FEATURES.some((feature) => {
    const config = value.settings[feature];
    return typeof value.configured[feature] !== "boolean" || !config || typeof config.followSession !== "boolean" || typeof config.fast !== "boolean" || !Number.isInteger(config.rounds) || config.rounds < 1 || config.rounds > 20 || ["provider", "model", "reasoningEffort"].some((key) => typeof config[key] !== "string");
  }))) throw invalid();
  if (value.finalAnswer !== void 0 && typeof value.finalAnswer !== "boolean") throw invalid();
  if (value.finalAnswerRevision !== void 0 && (!Number.isSafeInteger(value.finalAnswerRevision) || value.finalAnswerRevision < 0)) throw invalid();
  return Object.freeze({
    scope: "profile",
    revision: value.revision,
    enabled: Object.freeze({ suggest: value.enabled.suggest, enhance: value.enabled.enhance }),
    finalAnswer: value.finalAnswer !== false,
    finalAnswerRevision: value.finalAnswerRevision ?? 0,
    settingsRevision: hasSettings ? value.settingsRevision : null,
    settings: Object.freeze(Object.fromEntries(FEATURES.map((feature) => [feature, Object.freeze(sessionSettings(hasSettings ? value.settings[feature] : void 0))]))),
    configured: Object.freeze(Object.fromEntries(FEATURES.map((feature) => [feature, hasSettings && value.configured[feature]])))
  });
}
function mergeGlobalSettings(settings, global) {
  return Object.fromEntries(FEATURES.map((feature) => [feature, { ...sessionSettings(global?.data?.settings?.[feature]), enabled: global?.connected === true && global.data?.configured?.[feature] === true && global.data?.enabled[feature] === true }]));
}
function createEnablementObserver(controller) {
  let previous;
  return (frame, global) => {
    const identity = JSON.stringify([global?.connected === true, global?.data?.revision ?? null, global?.data?.settingsRevision ?? null, global?.data?.configured ?? null]);
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
    let data = normalizeEnablement(value);
    const old = state.data;
    if (old?.settingsRevision != null && data.settingsRevision === null) throw invalid();
    if (old && data.revision === old.revision && FEATURES.some((key) => data.enabled[key] !== old.enabled[key])) throw invalid();
    if (old && data.settingsRevision === old.settingsRevision && (JSON.stringify(data.settings) !== JSON.stringify(old.settings) || JSON.stringify(data.configured) !== JSON.stringify(old.configured))) throw invalid();
    if (old && data.revision === old.revision && data.settingsRevision === old.settingsRevision) return true;
    if (old) {
      if (data.revision <= old.revision && (data.settingsRevision ?? -1) <= (old.settingsRevision ?? -1)) return false;
      if (data.revision < old.revision) data = { ...data, revision: old.revision, enabled: old.enabled };
      if ((data.settingsRevision ?? -1) < (old.settingsRevision ?? -1)) data = { ...data, settingsRevision: old.settingsRevision, settings: old.settings, configured: old.configured };
      data = Object.freeze(data);
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
      if (!disposed && owner === epoch && revision === readEpoch) {
        writeAbort?.abort();
        writeAbort = null;
        watchAbort?.abort();
        void reader?.cancel().catch(() => {
        });
        publish({ connected: false, pending: null, saved: null, readError: ["transport-invalid-response", "global-settings-unavailable"].includes(error?.code) ? error.code : "global-unavailable" });
        clearRetry();
        timer = setTimer(() => {
          timer = null;
          void watch();
        }, backoff);
      }
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
        writeAbort?.abort();
        writeAbort = null;
        publish({ pending: null, writeError: state.pending ? "global-unavailable" : state.writeError, connected: false, loading: false, readError: ["transport-invalid-response", "global-settings-unavailable"].includes(error?.code) ? error.code : "global-unavailable", saved: null });
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
  async function configure(feature, config, expectedRevision, signal) {
    if (disposed || state.pending || !state.connected || !Number.isSafeInteger(state.data?.settingsRevision) || !FEATURES.includes(feature) || signal?.aborted) return false;
    if (expectedRevision !== state.data.settingsRevision) {
      publish({ writeError: "stale-global-settings", saved: null });
      return false;
    }
    const owner = epoch, abort = new AbortController();
    writeAbort = abort;
    const cancel = () => {
      abort.abort();
      if (!disposed && owner === epoch && writeAbort === abort) {
        writeAbort = null;
        publish({ pending: null, saved: null });
      }
    };
    signal?.addEventListener("abort", cancel, { once: true });
    publish({ pending: feature, writeError: null, saved: null });
    try {
      const value = await send("save-global", void 0, { feature, config: sessionSettings(config), expectedRevision }, abort.signal);
      if (disposed || owner !== epoch || abort.signal.aborted || !state.connected) return false;
      accept(value);
      if (!state.data.configured[feature] || JSON.stringify(state.data.settings[feature]) !== JSON.stringify(sessionSettings(config))) {
        publish({ writeError: "stale-global-settings" });
        await load();
        return false;
      }
      publish({ saved: { feature, kind: "settings", settingsRevision: state.data.settingsRevision } });
      return true;
    } catch (error) {
      if (!disposed && owner === epoch && !abort.signal.aborted) {
        const code2 = error?.code;
        publish({ writeError: ["stale-global-settings", "global-settings-unavailable", "global-unavailable", "forbidden"].includes(code2) ? code2 : "global-save-failed" });
        if (code2 === "stale-global-settings") await load();
      }
      return false;
    } finally {
      signal?.removeEventListener("abort", cancel);
      if (!disposed && owner === epoch && writeAbort === abort) {
        writeAbort = null;
        publish({ pending: null });
      }
    }
  }
  async function setEnabled(feature, enabled) {
    if (disposed || state.pending || !state.connected || !state.data || !FEATURES.includes(feature) || typeof enabled !== "boolean") return false;
    const owner = epoch, expectedRevision = state.data.revision, abort = new AbortController();
    writeAbort = abort;
    publish({ pending: feature, writeError: null, saved: null });
    try {
      const value = await send("set-enabled", void 0, { feature, enabled, expectedRevision }, abort.signal);
      if (disposed || owner !== epoch || abort.signal.aborted || !state.connected) return false;
      accept(value);
      if (state.data.enabled[feature] !== enabled) {
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
      if (!disposed && owner === epoch && writeAbort === abort) {
        writeAbort = null;
        publish({ pending: null });
      }
    }
  }
  async function setFinalAnswer(enabled) {
    if (disposed || state.pending || !state.connected || !state.data || typeof enabled !== "boolean") return false;
    const owner = epoch, expectedRevision = state.data.finalAnswerRevision ?? 0, abort = new AbortController();
    writeAbort = abort;
    publish({ pending: "final-answer", writeError: null, saved: null });
    try {
      const value = await send("set-final-answer", void 0, { enabled, expectedRevision }, abort.signal);
      if (disposed || owner !== epoch || abort.signal.aborted || !state.connected) return false;
      accept(value);
      if (state.data.finalAnswer !== enabled) {
        publish({ writeError: "stale-enablement" });
        await load();
        return false;
      }
      publish({ saved: { feature: "final-answer", revision: state.data.finalAnswerRevision } });
      return true;
    } catch (error) {
      if (!disposed && owner === epoch && !abort.signal.aborted) {
        const stale = error?.code === "stale-enablement";
        publish({ writeError: stale ? "stale-enablement" : "global-save-failed" });
        if (stale) await load();
      }
      return false;
    } finally {
      if (!disposed && owner === epoch && writeAbort === abort) {
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
    setFinalAnswer,
    configure,
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
    }, load: async () => false, setEnabled: async () => false, setFinalAnswer: async () => false, configure: async () => false });
  }
});

// assist/client/runtime.js
function useAssistRuntime(p) {
  const globalSource = p.globalSource ?? EMPTY_ENABLEMENT_SOURCE;
  const enablement = import_react4.default.useSyncExternalStore(globalSource.subscribe, globalSource.getSnapshot, globalSource.getSnapshot);
  const input = p.useInput((s) => s);
  const session = p.useSession((s) => s);
  const wire = import_react4.default.useSyncExternalStore(p.assistSource.subscribe, p.assistSource.getSnapshot, p.assistSource.getSnapshot);
  const selection = import_react4.default.useSyncExternalStore(p.assistModel.subscribe, p.assistModel.getSnapshot, p.assistModel.getSnapshot);
  const [host, setHost] = import_react4.default.useState(null);
  const [result2, setResult] = import_react4.default.useState({ pending: null, preview: null, noSuggestion: null, error: null });
  const [notice, setNotice] = import_react4.default.useState(null);
  const current = import_react4.default.useRef({ input, actions: p.inputActions, sessionId: p.sessionId });
  current.current = { input, actions: p.inputActions, sessionId: p.sessionId };
  const alive = import_react4.default.useRef(false);
  const send = p.assistSend;
  const controller = import_react4.default.useMemo(() => createAssistController({ send, actions: () => current.current.actions, publish: (value) => {
    if (alive.current) setResult(value);
  }, requestId: () => globalThis.crypto.randomUUID() }), [p.sessionId, send]);
  const observeEnablement = import_react4.default.useMemo(() => createEnablementObserver(controller), [controller]);
  const hostValue = host?.sessionId === p.sessionId ? host.value : null;
  const allowed = p.useAccess("commands/execute") && !session?.subagent && !session?.removed;
  const reconciled = reconcileState(hostValue, wire, session, allowed);
  const busy = reconciled.busy || !enablement.connected;
  const settings = import_react4.default.useMemo(() => mergeGlobalSettings(null, enablement), [enablement.connected, enablement.data]);
  const state = reconciled.state ? { ...reconciled.state, settings } : null;
  const route = selection?.next ?? state?.current;
  const routeKey2 = JSON.stringify(route ?? null);
  import_react4.default.useEffect(() => {
    alive.current = true;
    controller.mount();
    setHost(null);
    setNotice(null);
    setResult({ pending: null, preview: null, noSuggestion: null, error: null });
    p.refreshAssist().catch(() => {
    });
    return () => {
      alive.current = false;
      controller.dispose();
    };
  }, [p.sessionId, controller, send]);
  import_react4.default.useEffect(() => {
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
  import_react4.default.useEffect(() => {
    observeEnablement({ sessionId: p.sessionId, input, settings, qaId: state?.qaId, busy, paused: false, routeKey: routeKey2 }, enablement);
  }, [observeEnablement, p.sessionId, input, settings, state?.qaId, busy, routeKey2, enablement.connected, enablement.data]);
  async function save() {
    setNotice("settings.globalOnly");
    return false;
  }
  function edited() {
    setNotice("settings.globalOnly");
    controller.configurationEdited();
  }
  return { sessionId: p.sessionId, input, session, state, currentModel: route, settings, result: result2, controller, send, save, edited, dirty: false, dirtyFeatures: [], saving: false, notice, setNotice, allowed, busy, readInput: () => current.current.input };
}
function useModelOptions(runtime, feature, config, open) {
  const [catalog, setCatalog] = import_react4.default.useState({ providers: [], models: [] });
  const [capabilities, setCapabilities] = import_react4.default.useState(null);
  const [error, setError] = import_react4.default.useState(null);
  const current = runtime.currentModel;
  const provider = config.followSession ? current?.provider : config.provider;
  const model = config.followSession ? current?.model : config.model;
  import_react4.default.useEffect(() => {
    setCatalog({ providers: [], models: [] });
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
  import_react4.default.useEffect(() => {
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
var import_react4;
var init_runtime = __esm({
  "assist/client/runtime.js"() {
    import_react4 = __toESM(require("react"), 1);
    init_api();
    init_controller();
    init_enablement_source();
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

// assist/client/enhance-result.js
function isUnchangedEnhancement(original, text) {
  if (typeof original !== "string" || typeof text !== "string") return false;
  const normalize = (value) => value.replace(/\r\n/g, "\n").trim();
  return normalize(original) === normalize(text);
}
var init_enhance_result = __esm({
  "assist/client/enhance-result.js"() {
  }
});

// assist/client/preview.js
function NoSuggestion({ runtime: r, t }) {
  const value = r.result.noSuggestion;
  if (!ownsResult(value, r.sessionId) || value.feature !== "suggest" || value.outcome !== "no-suggestion" || value.text !== "" || value.automatic === true) return null;
  return h4(
    "div",
    { className: "lpa-row lpa-note", role: "status" },
    h4("span", null, t("noSuggestion")),
    value.fastSkipped === true ? h4("span", { className: "lpa-note" }, t("fastSkipped")) : null,
    h4("button", { type: "button", className: "lpa-button", onClick: () => r.controller.dismiss() }, t("dismiss"))
  );
}
function Preview({ runtime: r, actions, t, onApplied }) {
  const value = r.result.preview;
  if (!value || !ownsResult(value, r.sessionId)) return null;
  if (value.feature === "suggest" && (value.outcome !== void 0 && value.outcome !== "suggestion" || typeof value.text !== "string" || !value.text.trim() || isNoSuggestionPlaceholder(value.text))) return null;
  const blocked = value.snapshot.structured;
  const unchanged = value.feature === "enhance" && !value.streaming && isUnchangedEnhancement(value.original, value.text);
  const button = (key, action, disabled = false, primary = false) => h4("button", { type: "button", className: "lpa-button" + (primary ? " lpa-button--primary" : ""), onClick: action, disabled }, t(key));
  function apply2() {
    if (value.streaming || unchanged || !ownsResult(value, r.sessionId)) return;
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
  return h4(
    "section",
    { className: "lpa-preview", "aria-label": t(value.feature), "aria-busy": Boolean(value.streaming) },
    h4("header", { className: "lpa-preview-header" }, h4("span", null, t(value.feature)), value.streaming ? h4("span", { className: "lpa-preview-status" }, t("streamingShort")) : null),
    h4("pre", { className: "lpa-result-text" }, value.text),
    unchanged ? h4("p", { className: "lpa-note", role: "status" }, t("enhanceUnchanged")) : null,
    value.fastSkipped === true ? h4("p", { className: "lpa-note", role: "status" }, t("fastSkipped")) : null,
    blocked ? h4("p", { className: "lpa-note" }, t("structured")) : null,
    h4(
      "div",
      { className: "lpa-preview-actions" },
      button(value.feature === "suggest" ? "accept" : "apply", apply2, value.streaming || unchanged || blocked || !r.allowed || value.feature === "suggest" && r.busy || r.dirty, true),
      button("copy", copy, Boolean(value.streaming)),
      value.streaming ? button("cancel", () => r.controller.cancel()) : button("dismiss", () => r.controller.dismiss())
    ),
    h4(
      "div",
      { className: "lpa-preview-meta" },
      value.feature === "enhance" ? h4("details", null, h4("summary", null, t("showOriginal")), h4("pre", null, value.original)) : null,
      diagnostics ? h4(
        "details",
        null,
        h4("summary", null, t("generationDetails")),
        value.route ? h4("p", null, t("route"), ": ", [value.route.provider, value.route.model, value.route.reasoningEffort, value.route.fast ? t("fast") : ""].filter(Boolean).join(" / ")) : null,
        value.timing ? h4("p", null, t("firstTokenLabel"), ": ", formatDuration(value.timing.ttftMs, t("secondsUnit")), " \xB7 ", t("totalTimeLabel"), ": ", formatDuration(value.timing.totalMs, t("secondsUnit"))) : null,
        value.filesRead?.length ? h4("p", null, t("filesRead"), ": ", value.filesRead.map((f) => f.name).join(", ")) : null,
        value.warnings?.length ? h4("p", null, t("warningsLabel"), ": ", value.warnings.length) : null
      ) : null
    )
  );
}
var import_react5, h4;
var init_preview = __esm({
  "assist/client/preview.js"() {
    init_suggestion_result();
    import_react5 = __toESM(require("react"), 1);
    init_duration();
    init_editor();
    init_enhance_result();
    h4 = import_react5.default.createElement;
  }
});

// assist/client/selected-files.js
function SelectedFiles({ input, files, onChange, t }) {
  if (!input.occurrences.length) return null;
  return h5(
    "details",
    { className: "lpa-details" },
    h5("summary", null, t("references")),
    h5("p", { className: "lpa-note" }, t("fileLimits")),
    input.occurrences.map((occ, index) => {
      const entry = selectedFileOf(occ), key = String(occ.occurrenceId ?? index);
      return h5("div", { className: "lpa-reference", key }, entry ? h5("label", { className: "lpa-check" }, h5("input", { type: "checkbox", checked: Boolean(files[key]), "aria-label": t("readFile") + ": " + entry.name, onChange: (e) => onChange(key, e.target.checked ? entry : null) }), entry.name, h5("span", { className: "lpa-note" }, entry.path)) : h5("span", null, occ.label ?? t("references"), " \xB7 ", t("namesOnly")));
    })
  );
}
var import_react6, h5;
var init_selected_files = __esm({
  "assist/client/selected-files.js"() {
    import_react6 = __toESM(require("react"), 1);
    init_api();
    h5 = import_react6.default.createElement;
  }
});

// assist/client/panel.js
function AssistPanel(p) {
  const r = useAssistRuntime(p), t = p.t;
  const [files, setFiles] = import_react7.default.useState({}), [undo, setUndo] = import_react7.default.useState(null);
  import_react7.default.useEffect(() => {
    if (!r.session?.subagent && !r.session?.removed) p.settingsTarget.select(p.sessionId);
  }, [p.settingsTarget, p.sessionId, r.session?.subagent, r.session?.removed]);
  import_react7.default.useEffect(() => () => {
    p.assistEnhance.clear();
    p.assistSuggest.clear();
  }, [p.assistEnhance, p.assistSuggest]);
  import_react7.default.useEffect(() => {
    p.assistEnhance.update(enhanceAvailability(r), () => r.controller.generate("enhance", Object.values(files).filter(Boolean)));
    p.assistSuggest.update(suggestAvailability(r), () => r.controller.generate("suggest"));
  }, [p.assistEnhance, p.assistSuggest, r.controller, r.allowed, r.state, r.settings, r.dirty, r.busy, r.input, r.result.pending, files]);
  import_react7.default.useEffect(() => {
    setFiles({});
  }, [p.sessionId, r.input.draftRev]);
  import_react7.default.useEffect(() => {
    setUndo(null);
  }, [p.sessionId]);
  const visible = shouldShowPanel({ open: false, result: r.result, undo, input: r.input, sessionId: p.sessionId });
  if (r.session?.subagent || r.session?.removed || !visible && !r.input.occurrences.length) return null;
  const button = (key, onClick, disabled = false) => h6("button", { type: "button", className: "lpa-button", onClick, disabled }, t(key));
  const validUndo = ownsResult(undo, p.sessionId) && r.input.draft === undo.original && r.input.draftRev === undo.draftRev;
  const undoApply = () => {
    const result2 = undoText(undo, r.readInput, p.inputActions);
    if (result2.ok) setUndo(null);
    else r.setNotice(result2.reason);
  };
  const dismiss = () => {
    r.controller.dismiss();
    r.setNotice(null);
  };
  const notice = r.result.error ?? r.notice;
  return h6(ResultAnchor, null, h6(
    "section",
    { className: "lpa lpa-inline" + compactPanelModifier({ pending: r.result.pending, preview: r.result.preview, referenceCount: r.input.occurrences.length, notice, validUndo }), "aria-label": t("preview") },
    h6("style", null, css),
    h6(SelectedFiles, { input: r.input, files, t, onChange: (key, entry) => {
      r.controller.dismiss();
      setFiles((old) => ({ ...old, [key]: entry }));
    } }),
    r.result.pending && !r.result.preview ? h6("div", { className: "lpa-row lpa-pending", role: "status" }, h6("span", { className: "lpa-pending-mark", "aria-hidden": true }), t(r.result.pending === "suggest" ? "generatingSuggest" : "generating"), button("cancel", () => r.controller.cancel())) : null,
    h6(NoSuggestion, { runtime: r, t }),
    h6(Preview, { runtime: r, actions: p.inputActions, t, onApplied: setUndo }),
    validUndo ? h6("div", { className: "lpa-undo-actions" }, button("undo", undoApply, !r.allowed)) : null,
    visible && notice ? h6("div", { className: "lpa-row", role: "status" }, h6("span", { className: r.result.error ? "lpa-error" : "lpa-note" }, typeof notice === "string" && notice !== "requestError" ? t(notice) : errorText(notice, t)), button("dismiss", dismiss)) : null
  ));
}
var import_react7, h6;
var init_panel = __esm({
  "assist/client/panel.js"() {
    init_result_layout();
    init_result_anchor();
    import_react7 = __toESM(require("react"), 1);
    init_enhance_action();
    init_panel_visibility();
    init_runtime();
    init_preview();
    init_selected_files();
    init_editor();
    init_api();
    init_style();
    h6 = import_react7.default.createElement;
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
function displayCheckedAt(value) {
  const iso = formatCheckedAt(value);
  if (!iso) return null;
  const date = new Date(iso), pad = (number) => String(number).padStart(2, "0");
  return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1) + "-" + pad(date.getUTCDate()) + " " + pad(date.getUTCHours()) + ":" + pad(date.getUTCMinutes()) + ":" + pad(date.getUTCSeconds()) + " UTC";
}
function displayUtcTime(value) {
  return displayCheckedAt(value) ?? "";
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
  const source = typeof x.source === "string" && x.source.length > 0 && x.source.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(x.source) ? x.source : null;
  return Object.freeze({
    currentVersion: x.currentVersion,
    available: x.available,
    reason: x.reason,
    source,
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
function OnlineUpdatePanelContent({ snapshot = initialOnlineSnapshot(), updateAvailable = false, currentVersion = null, showAvailability = true, showInstall = true, t, acknowledged = false, onAcknowledge, onInstall, onConfirm, onConsent, onDismiss, onReload, onRecoveryAcknowledged, onForgetMarker }) {
  const { data, preparation, pending, consent, localError, uncertain, recordLost, confirmationRejected, recoveryAcknowledged, markerCleared } = snapshot;
  const operation = data?.operation;
  const canForget = canForgetOnlineMarker(snapshot);
  const active = operation && !operation.terminal;
  const staleRecord = Boolean(currentVersion && operation?.terminal && operation?.installedVersion && operation.installedVersion !== currentVersion);
  const button = (key, onClick, disabled = false, emphasis = "") => h7("button", { type: "button", className: "lpa-button" + emphasis, onClick, disabled }, t("online." + key));
  const field = (label, value) => h7("div", { className: "lpa-update-field", key: label }, h7("dt", null, t("online." + label)), h7("dd", null, value));
  const operationFields = () => h7(
    "dl",
    { className: "lpa-update-versions" },
    field("jobId", operation.jobId),
    field("taskFrom", operation.fromVersion),
    field("taskTarget", operation.targetVersion),
    field("installedVersion", operation.installedVersion ?? t("updates.unknown")),
    currentVersion ? field("runningVersion", currentVersion) : null
  );
  const operationNotes = () => [
    operation.error ? h7("p", { className: "lpa-error", key: "error" }, t("online.errorCode"), " ", h7("code", null, operation.error)) : null,
    operation.detailCode ? h7("p", { className: "lpa-note", key: "detail" }, t("online.detailCode"), " ", h7("code", null, operation.detailCode)) : null,
    operation.restartRequired ? h7("p", { className: "lpa-note", key: "restart" }, t("online.restart")) : null,
    operation.cancelRequested ? h7("p", { className: "lpa-note", key: "cancel" }, t("online.cancelRequested")) : null
  ];
  return h7(
    "section",
    { className: "lpa-subsection lpa-online-update", "aria-label": t("online.title"), "aria-busy": !!pending },
    h7("h3", { className: "lpa-subsection-title" }, t("online.title")),
    showAvailability && updateAvailable && data?.available && !active && !pending && !uncertain && !recordLost && operation?.phase !== "unknown" ? h7(
      "div",
      { className: "lpa-update-banner", role: "status", "aria-live": "polite", "aria-atomic": true },
      h7("span", { className: "lpa-update-badge" }, t("online.badge")),
      h7("div", { className: "lpa-update-banner-copy" }, h7("h4", null, t("online.availableTitle")), h7("p", null, t("online.availableHint")))
    ) : null,
    h7("p", { className: "lpa-note" }, t("online.userOnly")),
    h7("p", { className: "lpa-note" }, t("online.continuity")),
    operation && !uncertain && staleRecord ? h7(
      "details",
      { className: "lpa-update-history" },
      h7(
        "summary",
        null,
        t("online.history"),
        ": ",
        h7("code", null, operation.fromVersion),
        " \u2192 ",
        h7("code", null, operation.targetVersion),
        operation.installedVersion ? " \xB7 " + t("online.installedVersion") + " " + operation.installedVersion : "",
        currentVersion ? " \xB7 " + t("online.runningVersion") + " " + currentVersion : ""
      ),
      h7("p", { className: "lpa-note" }, t("online.recordStale")),
      h7("p", { className: "lpa-note" }, t("online.phase." + operation.phase)),
      operationFields(),
      operationNotes()
    ) : null,
    operation && !uncertain && !staleRecord ? h7(
      "div",
      { role: "status", "aria-live": "polite", "aria-atomic": true },
      h7("p", null, t("online.phase." + operation.phase)),
      operationFields(),
      operationNotes()
    ) : null,
    !data && !localError && !markerCleared ? h7("p", { role: "status" }, t("online.loading")) : null,
    data && !operation && !uncertain ? h7("p", { className: "lpa-note" }, t("online.noRecord")) : null,
    data && !data.available ? h7(
      import_react8.default.Fragment,
      null,
      h7(
        "p",
        { className: "lpa-note" },
        t("online.unavailable"),
        data.reason ? " (" + data.reason + ")" : null,
        data.source ? h7(import_react8.default.Fragment, null, " \xB7 " + t("online.sourceObserved") + ": ", h7("code", null, data.source)) : null
      ),
      data.reason === "unsupported-source" ? h7("p", { className: "lpa-note" }, t("online.unsupportedSourceHint")) : null
    ) : null,
    recordLost || uncertain ? h7("p", { className: "lpa-error", role: "alert" }, t(recordLost ? "online.recordLost" : "online.uncertain")) : null,
    localError ? h7("p", { className: "lpa-error", role: "alert" }, t(confirmationRejected ? "online.confirmationRejected" : "online.requestFailed"), " ", h7("code", null, localError)) : null,
    recordLost || uncertain ? h7(
      "div",
      { className: "lpa-update-install" },
      h7("p", { className: "lpa-note" }, t("online.forgetWarning")),
      h7("label", { className: "lpa-row" }, h7("input", {
        type: "checkbox",
        checked: recoveryAcknowledged === true,
        disabled: !canForget,
        onChange: (event) => onRecoveryAcknowledged?.(event.target.checked)
      }), t("online.forgetAcknowledgement")),
      button("forgetMarker", onForgetMarker, !canForget || recoveryAcknowledged !== true)
    ) : null,
    markerCleared ? h7("p", { className: "lpa-note", role: "status" }, t("online.markerCleared")) : null,
    preparation ? h7(
      "div",
      { className: "lpa-update-review" },
      h7("h4", null, t("online.review")),
      h7(
        "dl",
        { className: "lpa-update-versions" },
        field("fromVersion", preparation.fromVersion),
        field("targetVersion", preparation.targetVersion),
        field("targetSpec", h7("code", null, preparation.targetSpec)),
        field("restoreSpec", h7("code", null, preparation.restoreSpec)),
        field("expiresAt", h7("time", { dateTime: new Date(preparation.expiresAt).toISOString() }, displayUtcTime(preparation.expiresAt)))
      ),
      h7("p", { className: "lpa-update-risk" }, t("online.risks")),
      h7(
        "fieldset",
        { className: "lpa-update-consent" },
        h7("legend", null, t("online.consentTitle")),
        h7("label", { className: "lpa-row" }, h7("input", { type: "checkbox", checked: consent, disabled: !!pending, onChange: (event) => onConsent?.(event.target.checked) }), t("online.consent"))
      ),
      h7("div", { className: "lpa-row lpa-card-actions" }, button("confirm", onConfirm, !consent || !!pending || uncertain, " lpa-button--primary lpa-button--danger"), button("dismiss", onDismiss, !!pending))
    ) : null,
    h7(
      "div",
      { className: "lpa-row lpa-card-actions" },
      showInstall && !preparation && updateAvailable && data?.available && !active ? h7(
        import_react8.default.Fragment,
        null,
        h7("p", { className: "lpa-note" }, t("online.risks")),
        h7("label", { className: "lpa-row" }, h7("input", {
          type: "checkbox",
          checked: acknowledged === true,
          disabled: !!pending,
          onChange: (event) => onAcknowledge?.(event.target.checked)
        }), t("online.installConsent")),
        button(pending ? "installing" : "installNow", onInstall, !!pending || !acknowledged || uncertain, " lpa-button--primary")
      ) : null,
      button("reload", onReload, !!pending)
    ),
    pending === "confirm" ? h7("p", { role: "status" }, t("online.submitting")) : null
  );
}
function OnlineUpdatePanel({ t, updateAvailable, currentVersion = null, showAvailability = true, showInstall = true, fetcher = globalThis.fetch, controller: external = null }) {
  const controller = import_react8.default.useMemo(() => external ?? createOnlineUpdateController(fetcher), [external, fetcher]);
  const snapshot = import_react8.default.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [acknowledged, setAcknowledged] = import_react8.default.useState(false);
  import_react8.default.useEffect(() => {
    if (external) return;
    void controller.start();
    return () => controller.dispose();
  }, [controller, external]);
  const install = async () => {
    await controller.prepare();
    const live = controller.getSnapshot();
    if (!live.preparation || live.uncertain || live.localError) return;
    controller.setConsent(true);
    await controller.confirm();
  };
  return h7(OnlineUpdatePanelContent, {
    t,
    snapshot,
    updateAvailable,
    currentVersion,
    showAvailability,
    showInstall,
    acknowledged,
    onAcknowledge: setAcknowledged,
    onInstall: () => {
      void install();
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
var import_react8, h7;
var init_online_update_panel = __esm({
  "assist/client/online-update-panel.js"() {
    import_react8 = __toESM(require("react"), 1);
    init_online_update_state();
    init_update_state();
    h7 = import_react8.default.createElement;
  }
});

// assist/client/update-panel.js
function UpdatePanelContent({ snapshot = initialUpdateSnapshot(), t, onCheck, onReload, onCancel, onCopy, copyStatus, install = null, acknowledged = false, children }) {
  const view = updateDisplay(snapshot);
  const data = snapshot.data;
  const available = view.status === "update-available";
  const button = (key, onClick, disabled = false) => h8("button", { type: "button", className: "lpa-button", onClick, disabled }, t(key));
  const field = (label, value, highlight = false) => h8(
    "div",
    { className: "lpa-update-field lpa-stat" + (highlight ? " lpa-update-field--highlight lpa-stat--highlight" : ""), key: label },
    h8("dt", null, t(label)),
    h8("dd", null, value)
  );
  return h8(
    "section",
    { className: "lpa-update-panel lpa-card", "aria-label": t("updates.title") },
    h8(
      "header",
      { className: "lpa-card-header" },
      h8("h2", { className: "lpa-update-title lpa-card-title" }, t("settings.updatesSection")),
      h8("p", { className: "lpa-note" }, t("updates.readOnly"))
    ),
    h8(
      "dl",
      { className: "lpa-update-versions lpa-stats" },
      field("updates.installedVersion", data?.currentVersion ?? t("updates.unknown")),
      field("updates.latestVersion", data?.latestVersion ?? t("updates.unknown"), available),
      field("updates.checkedAt", view.checkedAt ? h8("time", { dateTime: view.checkedAt }, displayCheckedAt(new Date(view.checkedAt).getTime()) ?? view.checkedAt) : t("updates.notChecked"))
    ),
    available ? h8(
      "div",
      { className: "lpa-update-summary lpa-update-summary--available", role: "status", "aria-live": "polite", "aria-atomic": true },
      h8("strong", null, t("updates.availableTitle")),
      h8("p", null, t(view.message)),
      h8("p", null, t("updates.availableHint"))
    ) : h8(
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
    h8(
      "div",
      { className: "lpa-row lpa-card-actions" },
      // Once a newer stable release is known the primary action belongs here: installing from the
      // card avoids scrolling down to the online section just to start the same job.
      available && install ? h8(
        import_react9.default.Fragment,
        null,
        h8(
          "label",
          { className: "lpa-row lpa-update-consent-inline" },
          h8("input", { type: "checkbox", checked: acknowledged === true, disabled: install.pending, onChange: (event) => install.onAcknowledge(event.target.checked) }),
          t("updates.installConsent")
        ),
        h8("button", {
          type: "button",
          className: "lpa-button lpa-button--primary",
          onClick: install.onInstall,
          disabled: !acknowledged || install.pending
        }, t(install.pending ? "updates.installing" : "updates.installNow"))
      ) : button(snapshot.pending === "check" ? "updates.checkingButton" : "updates.checkButton", onCheck, snapshot.pending === "check"),
      snapshot.pending ? button("updates.cancel", onCancel) : null,
      snapshot.localError ? button("updates.reloadStatus", onReload) : null,
      view.releaseUrl ? h8("a", { className: "lpa-button", href: view.releaseUrl, target: "_blank", rel: "noopener noreferrer" }, t("updates.releaseLink")) : null
    ),
    h8(
      "details",
      { className: "lpa-footnote-details" },
      h8("summary", null, t("settings.advanced")),
      h8("p", { className: "lpa-note" }, t("updates.privacy")),
      h8("p", { className: "lpa-note" }, t("updates.cacheNote"))
    ),
    h8("div", { className: "lpa-divider" }),
    children,
    h8(
      "div",
      { className: "lpa-update-install lpa-install-row" },
      h8("span", null, t("updates.installAddress")),
      h8("code", null, INSTALL_SPEC),
      button("updates.copy", onCopy),
      copyStatus ? h8("span", { className: "lpa-note", role: "status" }, t("updates." + copyStatus)) : null
    ),
    h8(
      "details",
      { className: "lpa-update-guide" },
      h8("summary", null, t("updates.manualUpgrade")),
      h8(
        "ol",
        null,
        h8("li", null, t("updates.stepSave")),
        h8("li", null, t("updates.stepRemove"), " ", h8("code", null, "@local/dsh-openai-fast")),
        h8("li", null, t("updates.stepInstall"), " ", h8("code", null, INSTALL_SPEC)),
        h8("li", null, t("updates.stepRestart"))
      ),
      h8("p", { className: "lpa-note" }, t("updates.backup"))
    )
  );
}
function UpdatePanel({ t, fetcher = globalThis.fetch }) {
  const controller = import_react9.default.useMemo(() => createUpdateController(fetcher), [fetcher]);
  const online = import_react9.default.useMemo(() => createOnlineUpdateController(fetcher), [fetcher]);
  const snapshot = import_react9.default.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const onlineSnapshot = import_react9.default.useSyncExternalStore(online.subscribe, online.getSnapshot, online.getSnapshot);
  const [copyStatus, setCopyStatus] = import_react9.default.useState(null);
  const [acknowledged, setAcknowledged] = import_react9.default.useState(false);
  const copyEpoch = import_react9.default.useRef(0);
  import_react9.default.useEffect(() => {
    void controller.start();
    void online.start();
    return () => {
      copyEpoch.current += 1;
      controller.dispose();
      online.dispose();
    };
  }, [controller, online]);
  async function copy() {
    const revision = ++copyEpoch.current;
    try {
      await copyInstallSpec();
      if (copyEpoch.current === revision) setCopyStatus("copied");
    } catch {
      if (copyEpoch.current === revision) setCopyStatus("copyFailed");
    }
  }
  async function install() {
    await online.prepare();
    const live = online.getSnapshot();
    if (!live.preparation || live.uncertain || live.localError) return;
    online.setConsent(true);
    await online.confirm();
  }
  const operation = onlineSnapshot.data?.operation;
  const installPending = onlineSnapshot.pending !== null || Boolean(operation && !operation.terminal);
  return h8(
    UpdatePanelContent,
    {
      snapshot,
      t,
      copyStatus,
      onCopy: copy,
      acknowledged,
      install: { pending: installPending, onAcknowledge: setAcknowledged, onInstall: () => {
        void install();
      } },
      onCheck: () => {
        void controller.check();
      },
      onReload: () => {
        void controller.load();
      },
      onCancel: () => controller.cancel()
    },
    h8(OnlineUpdatePanel, {
      t,
      fetcher,
      controller: online,
      snapshot: onlineSnapshot,
      currentVersion: snapshot.data?.currentVersion ?? null,
      // The enclosing card already announces the available release and carries the install action.
      showAvailability: false,
      showInstall: false,
      updateAvailable: snapshot.data?.status === "update-available"
    })
  );
}
var import_react9, h8;
var init_update_panel = __esm({
  "assist/client/update-panel.js"() {
    import_react9 = __toESM(require("react"), 1);
    init_update_state();
    init_online_update_panel();
    init_online_update_state();
    h8 = import_react9.default.createElement;
  }
});

// assist/client/model-style-pref.js
function readModelStylePref() {
  try {
    const value = localStorage.getItem(KEY);
    return MODEL_STYLES.includes(value) ? value : "claude";
  } catch {
    return "claude";
  }
}
function writeModelStylePref(value) {
  try {
    localStorage.setItem(KEY, MODEL_STYLES.includes(value) ? value : "claude");
  } catch {
  }
  try {
    window.dispatchEvent(new Event(MODEL_STYLE_EVENT));
  } catch {
  }
}
function onModelStyleChange(listener) {
  try {
    window.addEventListener(MODEL_STYLE_EVENT, listener);
    return () => window.removeEventListener(MODEL_STYLE_EVENT, listener);
  } catch {
    return () => {
    };
  }
}
var KEY, MODEL_STYLE_EVENT, MODEL_STYLES;
var init_model_style_pref = __esm({
  "assist/client/model-style-pref.js"() {
    KEY = "lpa_model_picker_style";
    MODEL_STYLE_EVENT = "lpa-model-style-change";
    MODEL_STYLES = ["dsh", "claude", "zcode"];
  }
});

// assist/client/settings.js
function Settings(p) {
  const { t, config: v, catalog: c, capabilities: cap } = p;
  const change = (patch) => p.onChange({ ...v, ...patch });
  const field = (key, node) => h9("label", { className: "lpa-field" }, t(key), node);
  const check = (key, checked, change2, disabled = false) => h9("label", { className: "lpa-check" }, h9("input", { type: "checkbox", checked, disabled, onChange: (e) => change2(e.target.checked) }), t(key));
  const [custom, setCustom] = import_react10.default.useState(![1, 3, 5].includes(v.rounds));
  const [error, setError] = import_react10.default.useState(null);
  import_react10.default.useEffect(() => {
    setCustom(![1, 3, 5].includes(v.rounds));
  }, [v.rounds]);
  const efforts = cap?.efforts ?? [];
  const invalidEffort = !v.followSession && cap && v.reasoningEffort && !efforts.some((e) => e.id === v.reasoningEffort);
  const invalidFast = cap && v.fast && !cap.fastEligible;
  const submit = (e) => {
    e.preventDefault();
    const problem = validateSettings(v);
    setError(problem === "rounds" ? "roundsError" : problem ? "modelError" : null);
    if (!problem && !invalidEffort) p.save(sessionSettings(v));
  };
  const select = (key, value, items, change2) => field(key, h9("select", { value, onChange: (e) => change2(e.target.value) }, items.map((item) => h9("option", { key: item.id, value: item.id }, item.name))));
  return h9(
    "form",
    { onSubmit: submit },
    h9("div", { className: "lpa-row" }, check("follow", v.followSession, (followSession) => change({ followSession }))),
    h9("p", { className: "lpa-note" }, t("followHint")),
    v.followSession && !cap ? h9("p", { className: "lpa-note", role: "status" }, t("settings.modelUnknown")) : null,
    h9("p", { className: "lpa-note" }, t("budgetPolicy")),
    !v.followSession ? h9(
      "div",
      { className: "lpa-grid" },
      select("provider", v.provider, [{ id: "", name: t("selectProvider") }, ...c.providers], (provider) => change({ provider, model: "" })),
      select("model", v.model, [{ id: "", name: t("selectModel") }, ...c.models.filter((m) => m.provider === v.provider)], (model) => change({ model })),
      select("effort", v.reasoningEffort, [{ id: "", name: t("nativeDefault") }, ...invalidEffort ? [{ id: v.reasoningEffort, name: v.reasoningEffort }] : [], ...efforts], (reasoningEffort) => change({ reasoningEffort }))
    ) : null,
    invalidEffort ? h9("p", { className: "lpa-error", role: "alert" }, t("effortInvalid")) : null,
    check("fast", v.fast, (fast2) => change({ fast: fast2 }), !v.fast && !v.followSession && cap?.fastEligible !== true),
    invalidFast ? h9("p", { className: "lpa-note", role: "status" }, t("fastSkipped")) : null,
    h9(
      "div",
      { className: "lpa-grid" },
      select("rounds", custom ? "custom" : String(v.rounds), [1, 3, 5].map((n) => ({ id: String(n), name: n })).concat({ id: "custom", name: t("custom") }), (value) => {
        setCustom(value === "custom");
        if (value !== "custom") change({ rounds: Number(value) });
      }),
      custom ? field("custom", h9("input", { type: "number", min: 1, max: 20, step: 1, value: Number.isFinite(v.rounds) ? v.rounds : "", onChange: (e) => change({ rounds: e.target.value === "" ? NaN : Number(e.target.value) }) })) : null
    ),
    error ? h9("p", { role: "alert", className: "lpa-error" }, t(error)) : null,
    p.feedback ?? null,
    h9("button", { className: "lpa-button lpa-button--primary", type: "submit", disabled: p.saving || !p.allowed }, t(p.saving ? "saving" : "save"))
  );
}
var import_react10, h9;
var init_settings = __esm({
  "assist/client/settings.js"() {
    import_react10 = __toESM(require("react"), 1);
    init_api();
    h9 = import_react10.default.createElement;
  }
});

// assist/client/enablement-panel.js
function EnablementPanelContent({ snapshot, t, onSet, onReload, onFinalAnswer }) {
  const { data, connected, loading, pending, readError, writeError, saved } = snapshot;
  const disabled = !data || !connected || !!pending;
  const message = writeError === "stale-enablement" ? "global.stale" : writeError ? "global.saveFailed" : readError ? "global.disconnected" : null;
  return h10(
    "section",
    { className: "lpa-feature lpa-card", "aria-label": t("global.title"), "aria-busy": !!pending },
    h10(
      "header",
      { className: "lpa-card-header" },
      h10("h2", { className: "lpa-feature-title lpa-card-title" }, t("settings.globalSection")),
      h10("p", { className: "lpa-note" }, t("global.scope"))
    ),
    h10("div", { className: "lpa-row lpa-switches" }, ["suggest", "enhance"].map((feature) => h10(
      "label",
      { className: "lpa-check lpa-switch-row", key: feature },
      h10("span", { className: "lpa-switch-copy" }, h10("strong", null, t("global." + feature)), h10("span", { className: "lpa-note" }, t("global." + feature + "Hint"))),
      h10("input", { className: "lpa-switch", type: "checkbox", checked: data?.enabled[feature] === true, disabled, onChange: (event) => onSet(feature, event.target.checked) })
    ))),
    // Profile-wide prompt switch: it rides the injected closing contract, not a model call.
    h10(
      "label",
      { className: "lpa-check lpa-switch-row", key: "final-answer" },
      h10("span", { className: "lpa-switch-copy" }, h10("strong", null, t("global.finalAnswer")), h10("span", { className: "lpa-note" }, t("global.finalAnswerHint"))),
      h10("input", { className: "lpa-switch", type: "checkbox", checked: data?.finalAnswer !== false, disabled, onChange: (event) => onFinalAnswer?.(event.target.checked) })
    ),
    pending ? h10("p", { role: "status" }, t("global.saving")) : null,
    !connected && !message ? h10("p", { role: "status", className: "lpa-note" }, t(loading ? "global.loading" : "global.disconnected")) : null,
    message ? h10("p", { role: "alert", className: "lpa-error" }, t(message)) : null,
    saved && connected && saved.revision === data?.revision && !writeError ? h10("p", { role: "status", className: "lpa-note" }, t("global.saved")) : null,
    !connected || readError || writeError ? h10("div", { className: "lpa-card-actions" }, h10("button", { type: "button", className: "lpa-button", onClick: onReload, disabled: !!pending || loading }, t("global.reload"))) : null,
    h10("div", { className: "lpa-footnote" }, h10("p", { className: "lpa-note" }, t("global.charge")), h10("p", { className: "lpa-note" }, t("global.migration")))
  );
}
function EnablementPanel({ globalSource = EMPTY_ENABLEMENT_SOURCE, t }) {
  const snapshot = import_react11.default.useSyncExternalStore(globalSource.subscribe, globalSource.getSnapshot, globalSource.getSnapshot);
  return h10(EnablementPanelContent, {
    snapshot,
    t,
    onSet: (feature, value) => {
      void globalSource.setEnabled(feature, value);
    },
    onFinalAnswer: (value) => {
      void globalSource.setFinalAnswer?.(value);
    },
    onReload: () => {
      void globalSource.load();
    }
  });
}
var import_react11, h10;
var init_enablement_panel = __esm({
  "assist/client/enablement-panel.js"() {
    import_react11 = __toESM(require("react"), 1);
    init_enablement_source();
    h10 = import_react11.default.createElement;
  }
});

// policy.js
var DEFAULT_PROVIDERS;
var init_policy = __esm({
  "policy.js"() {
    init_model_id();
    init_fast_route();
    DEFAULT_PROVIDERS = Object.freeze(["openai", "openai-codex"]);
  }
});

// assist/client/priority-panel.js
function availableCandidates(candidates, state) {
  const excluded = /* @__PURE__ */ new Set([...providerIds(state?.configured), ...providerIds(state?.authorized)]);
  const seen = /* @__PURE__ */ new Set();
  return (Array.isArray(candidates) ? candidates : []).flatMap((item) => {
    if (!item || typeof item.id !== "string" || !PROVIDER.test(item.id) || item.configured !== false || excluded.has(item.id) || seen.has(item.id) || !Array.isArray(item.openAIModels)) return [];
    const openAIModels = item.openAIModels.filter((model) => typeof model === "string" && isPriorityModel(model)).slice(0, 8);
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
  const names = state?.names && typeof state.names === "object" ? state.names : {};
  const nameOf = (id2) => typeof names[id2] === "string" && names[id2] && names[id2] !== id2 ? names[id2] : null;
  const builtinModels = new Map(raw.filter((item) => item && item.configured === true && Array.isArray(item.openAIModels)).map((item) => [item.id, item.openAIModels.filter((model) => typeof model === "string" && isPriorityModel(model)).slice(0, 8)]));
  const button = (key, action, disabled = false, extra = {}) => h11(
    "button",
    { type: "button", className: "lpa-button", onClick: action, disabled, ...extra },
    t(key)
  );
  return h11(
    "section",
    { className: "lpa-feature lpa-card", "aria-label": t("priority.title"), "aria-busy": Boolean(pending) },
    h11(
      "header",
      { className: "lpa-card-header" },
      h11("h2", { className: "lpa-feature-title lpa-card-title" }, t("settings.prioritySection")),
      h11("p", { className: "lpa-note" }, t("priority.scope"))
    ),
    h11(
      "div",
      { className: "lpa-field" },
      h11("strong", null, t("priority.configured")),
      h11("div", { className: "lpa-chip-list" }, configured.map((id2) => h11(
        "div",
        { className: "lpa-provider-item", key: id2 },
        h11(
          "span",
          { className: "lpa-note lpa-chip lpa-chip--readonly" },
          nameOf(id2) ? h11("strong", null, nameOf(id2)) : null,
          h11("code", null, id2)
        ),
        builtinModels.get(id2)?.length ? h11("span", { className: "lpa-note lpa-chip-models" }, " \xB7 " + t("priority.visibleModels") + ": " + builtinModels.get(id2).join(", ")) : null
      )))
    ),
    h11(
      "div",
      { className: "lpa-field" },
      h11("strong", null, t("priority.authorized")),
      h11("div", { className: "lpa-chip-list" }, authorized.map((id2) => h11(
        "span",
        { className: "lpa-row lpa-chip", key: id2 },
        nameOf(id2) ? h11("strong", null, nameOf(id2)) : null,
        h11("code", null, id2),
        button("priority.revoke", () => onRevoke?.(id2), !state || Boolean(pending), { "aria-label": t("priority.revoke") + ": " + id2, className: "lpa-button lpa-chip-action" })
      ))),
      state && !authorized.length ? h11("p", { className: "lpa-note" }, t("priority.none")) : null
    ),
    h11(
      "div",
      { className: "lpa-card-actions lpa-priority-actions" },
      available.length ? h11(
        "label",
        { className: "lpa-field" },
        t("priority.candidates"),
        h11(
          "select",
          {
            value: selection?.id ?? "",
            disabled: !state || Boolean(pending),
            onChange: (event) => onSelect?.(event.target.value)
          },
          h11("option", { value: "" }, t("priority.choose")),
          available.map((item) => h11("option", { key: item.id, value: item.id }, item.name + " (" + item.id + ")"))
        )
      ) : null,
      state && !available.length ? h11("p", { className: "lpa-note" }, t(raw.length ? "priority.allAuthorized" : "priority.noProviderModels")) : null,
      selection ? h11("p", { className: "lpa-note" }, t("priority.exampleModels"), ": ", selection.openAIModels.join(", ")) : null,
      h11("label", { className: "lpa-check" }, h11("input", {
        type: "checkbox",
        checked: consent === true,
        disabled: !state || Boolean(pending),
        onChange: (event) => onConsent?.(event.target.checked)
      }), t("priority.consent")),
      h11(
        "div",
        { className: "lpa-row lpa-action-buttons" },
        button("priority.authorize", () => onAuthorize?.(selected, consent), !state || Boolean(pending) || consent !== true || !selection),
        button("priority.reload", () => onReload?.(), Boolean(pending))
      )
    ),
    pending || !state && !notice ? h11("p", { className: "lpa-note", role: "status" }, t("priority.loading")) : null,
    notice ? h11("p", { className: notice === "priority.error" ? "lpa-error" : "lpa-note", role: "status" }, t(notice)) : null
  );
}
function readState(value) {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0) throw { code: "invalid-response" };
  for (const key of ["configured", "authorized", "effective"]) {
    if (!Array.isArray(value[key]) || value[key].some((id2) => typeof id2 !== "string" || !PROVIDER.test(id2))) throw { code: "invalid-response" };
  }
  const names = {};
  if (value.names !== void 0 && value.names !== null) {
    if (typeof value.names !== "object" || Array.isArray(value.names)) throw { code: "invalid-response" };
    for (const [id2, name] of Object.entries(value.names)) {
      if (PROVIDER.test(id2) && typeof name === "string" && name.length > 0 && name.length <= 80) names[id2] = name;
    }
  }
  return Object.freeze({
    revision: value.revision,
    configured: Object.freeze([...value.configured]),
    authorized: Object.freeze([...value.authorized]),
    effective: Object.freeze([...value.effective]),
    names: Object.freeze(names)
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
    const result2 = await connection.rpc.call(ASSIST_CHANNEL, ENDPOINT, payload, signal);
    if (signal.aborted) throw { code: "cancelled" };
    if (result2?.ok !== true) throw { code: result2?.error?.code };
    return result2.value;
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
  const changed = import_react12.default.useRef(onChanged);
  changed.current = onChanged;
  const controller = import_react12.default.useMemo(() => createPriorityController(connection, { onChanged: () => changed.current?.() }), [connection]);
  const snapshot = import_react12.default.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [selected, setSelected] = import_react12.default.useState("");
  const [consent, setConsent] = import_react12.default.useState(false);
  import_react12.default.useEffect(() => {
    void controller.start();
    return () => controller.dispose();
  }, [controller]);
  import_react12.default.useEffect(() => {
    setConsent(false);
  }, [snapshot.state?.revision, snapshot.notice]);
  import_react12.default.useEffect(() => {
    if (selected && !availableCandidates(snapshot.candidates, snapshot.state).some((item) => item.id === selected)) {
      setSelected("");
      setConsent(false);
    }
  }, [snapshot.candidates, snapshot.state, selected]);
  return h11(PriorityPanelContent, {
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
var import_react12, h11, ENDPOINT, PROVIDER, providerIds, notices, noticeFor;
var init_priority_panel = __esm({
  "assist/client/priority-panel.js"() {
    import_react12 = __toESM(require("react"), 1);
    init_identity();
    init_policy();
    init_priority_source();
    h11 = import_react12.default.createElement;
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
function createSettingsDraft(config, settingsRevision = null) {
  return { config: sessionSettings(config), version: 0, dirty: false, settingsRevision };
}
function editSettingsDraft(state, config) {
  return { ...state, config: sessionSettings(config), version: state.version + 1, dirty: true };
}
function syncSettingsDraft(state, config, settingsRevision) {
  return state.dirty ? state : { ...state, config: sessionSettings(config), settingsRevision };
}
function acceptSettingsSave(state, version3, config, settingsRevision = state.settingsRevision) {
  if (state.version !== version3) return state;
  return { config: sessionSettings(config), version: version3, dirty: false, settingsRevision };
}
function matchesSettingsSave(snapshot, feature, config) {
  const { data, saved } = snapshot;
  return snapshot.connected === true && saved?.kind === "settings" && saved.feature === feature && saved.settingsRevision === data?.settingsRevision && data?.configured?.[feature] === true && JSON.stringify(sessionSettings(data.settings[feature])) === JSON.stringify(sessionSettings(config));
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
function FeatureSettings({ feature, global, source, p }) {
  const host = global.data;
  const [draft, setDraft] = import_react13.default.useState(() => createSettingsDraft(host.settings[feature], host.settingsRevision));
  const current = import_react13.default.useRef(draft);
  current.current = draft;
  const [saving, setSaving] = import_react13.default.useState(false), [notice, setNotice] = import_react13.default.useState(null);
  const scope = import_react13.default.useRef(null), inFlight = import_react13.default.useRef(false);
  import_react13.default.useEffect(() => {
    const requests = createSettingsRequests();
    scope.current = requests;
    inFlight.current = false;
    setSaving(false);
    return () => requests.close();
  }, []);
  import_react13.default.useEffect(() => {
    const next = syncSettingsDraft(current.current, host.settings[feature], host.settingsRevision);
    current.current = next;
    setDraft(next);
  }, [host.settingsRevision, host.settings[feature]]);
  const runtime = { send: p.assistSend };
  const options = useModelOptions(runtime, feature, draft.config, true);
  const allowed = global.connected && Number.isSafeInteger(host.settingsRevision) && !global.pending;
  const stale = draft.dirty && draft.settingsRevision !== host.settingsRevision;
  const edit = (config) => {
    const next = editSettingsDraft(current.current, config);
    current.current = next;
    setDraft(next);
    setNotice(null);
  };
  async function save(config) {
    if (!allowed || inFlight.current || !scope.current) return;
    const request = scope.current.begin(), version3 = current.current.version, base = current.current.settingsRevision;
    inFlight.current = true;
    setSaving(true);
    setNotice(null);
    try {
      const saved = await source.configure(feature, config, base, request.signal);
      if (!request.valid()) return;
      const snapshot = source.getSnapshot();
      if (saved && matchesSettingsSave(snapshot, feature, config)) {
        const next = acceptSettingsSave(current.current, version3, config, snapshot.saved.settingsRevision);
        current.current = next;
        setDraft(next);
        if (!next.dirty) setNotice("saved");
      } else setNotice({ code: saved ? "stale-global-settings" : snapshot.writeError ?? "global-unavailable" });
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
  function reset() {
    const next = createSettingsDraft(host.settings[feature], host.settingsRevision);
    current.current = next;
    setDraft(next);
    setNotice(null);
  }
  const noticeValue = notice ?? options.error;
  return h12(
    "section",
    { className: "lpa-feature lpa-card", "aria-label": p.t(feature) },
    h12("h2", { className: "lpa-feature-title" }, p.t(feature)),
    h12("p", { className: "lpa-note" }, p.t(feature === "suggest" ? "suggestContext" : "enhanceOriginal")),
    h12("p", { className: "lpa-note", role: "status" }, host.configured[feature] ? null : p.t("settings.unconfigured")),
    h12(Settings, {
      t: p.t,
      config: draft.config,
      catalog: options.catalog,
      capabilities: options.capabilities,
      allowed: allowed && !stale,
      saving,
      onChange: edit,
      save,
      feedback: h12(
        "div",
        { className: "lpa-settings-feedback" },
        draft.dirty ? h12("p", { className: "lpa-note" }, p.t("settingsChanged")) : null,
        stale ? h12("p", { className: "lpa-error", role: "alert" }, p.t("settings.stale")) : null,
        draft.dirty ? h12("button", { type: "button", className: "lpa-button", disabled: !global.connected || Boolean(global.pending), onClick: reset }, p.t("settings.resetDraft")) : null,
        noticeValue ? h12("p", { role: "status", className: noticeValue === "saved" ? "lpa-note" : "lpa-error" }, noticeValue === "saved" ? p.t("saved") : errorText(noticeValue, p.t)) : null
      )
    })
  );
}
function ModelStyleCard({ t }) {
  const [style, setStyle] = import_react13.default.useState(readModelStylePref());
  const options = [
    ["dsh", "settings.modelStyleDsh", "settings.modelStyleDshNote"],
    ["claude", "settings.modelStyleClaude", "settings.modelStyleClaudeNote"],
    ["zcode", "settings.modelStyleZcode", "settings.modelStyleZcodeNote"]
  ];
  return h12(
    "section",
    { className: "lpa-feature lpa-card", "aria-label": t("settings.modelStyleSection") },
    h12("header", { className: "lpa-card-header" }, h12("h2", { className: "lpa-feature-title lpa-card-title" }, t("settings.modelStyleSection")), h12("p", { className: "lpa-note" }, t("settings.modelStyleHint"))),
    h12(
      "div",
      { className: "lpa-style-options", role: "radiogroup", "aria-label": t("settings.modelStyleSection") },
      options.map(([value, nameKey, noteKey]) => h12(
        "button",
        {
          key: value,
          type: "button",
          role: "radio",
          "aria-checked": style === value,
          className: "lpa-style-option" + (style === value ? " lpa-style-option--active" : ""),
          onClick: () => {
            setStyle(value);
            writeModelStylePref(value);
          }
        },
        h12("span", { className: "lpa-style-option-name" }, t(nameKey)),
        h12("span", { className: "lpa-note" }, t(noteKey))
      ))
    )
  );
}
function SettingsPage(p) {
  const target = import_react13.default.useSyncExternalStore(p.targetSource.subscribe, p.targetSource.getSnapshot, p.targetSource.getSnapshot);
  const source = p.globalSource ?? EMPTY_ENABLEMENT_SOURCE;
  const global = import_react13.default.useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  const [stored, setStored] = import_react13.default.useState(readSection), nav = import_react13.default.useRef(null);
  const sections = [
    { key: "assist", label: "settings.nav.assist", render: () => h12(
      import_react13.default.Fragment,
      null,
      h12(EnablementPanel, { globalSource: source, t: p.t }),
      h12(
        "section",
        { className: "lpa-session-panel lpa-card", "aria-label": p.t("settings.profileSection") },
        h12("header", { className: "lpa-card-header" }, h12("h2", { className: "lpa-card-title" }, p.t("settings.profileSection")), h12("p", { className: "lpa-note" }, p.t("profileScope"))),
        global.loading ? h12("p", { role: "status" }, p.t("global.loading")) : null,
        !global.connected ? h12("p", { className: "lpa-note", role: "status" }, p.t("global.disconnected")) : null,
        global.readError ? h12("p", { className: "lpa-error", role: "alert" }, errorText(global.readError, p.t)) : null,
        global.data && !Number.isSafeInteger(global.data.settingsRevision) ? h12("p", { className: "lpa-error", role: "alert" }, p.t("settings.hostUpgrade")) : null,
        global.data ? h12("div", { className: "lpa-settings-cards" }, ["suggest", "enhance"].map((feature) => h12(FeatureSettings, { key: feature, feature, global, source, p }))) : h12("p", { className: "lpa-note lpa-empty-state" }, p.t("settings.profileEmpty"))
      )
    ) },
    p.connection ? { key: "priority", label: "settings.nav.priority", render: () => h12(PriorityPanel, { connection: p.connection, t: p.t, onChanged: () => {
      if (target.sessionId) void p.refreshAssist(target.sessionId).catch(() => {
      });
    } }) } : null,
    { key: "style", label: "settings.nav.style", render: () => h12(ModelStyleCard, { t: p.t }) },
    { key: "update", label: "settings.nav.update", render: () => h12(UpdatePanel, { t: p.t }) }
  ].filter(Boolean);
  const active = sections.some((section) => section.key === stored) ? stored : sections[0].key;
  const select = (key) => {
    setStored(key);
    writeSection(key);
  };
  const moveFocus = (event) => {
    const keys = sections.map((section) => section.key), index = keys.indexOf(active);
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown", back = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const next = event.key === "Home" ? 0 : event.key === "End" ? keys.length - 1 : forward ? Math.min(keys.length - 1, index + 1) : back ? Math.max(0, index - 1) : -1;
    if (next < 0 || next === index) return;
    event.preventDefault();
    select(keys[next]);
    const buttons = nav.current?.querySelectorAll("[role=tab]");
    buttons?.[next]?.focus();
  };
  return h12(
    "section",
    { className: "lpa lpa-settings-page", "aria-label": p.t("title") },
    // Tabs sit above the page title, matching the built-in Computer use settings page.
    h12(
      "nav",
      { ref: nav, className: "lpa-settings-nav", role: "tablist", "aria-orientation": "horizontal", "aria-label": p.t("settings.sectionNav"), onKeyDown: moveFocus },
      sections.map((section) => h12("button", {
        key: section.key,
        type: "button",
        role: "tab",
        id: "lpa-tab-" + section.key,
        "aria-selected": active === section.key,
        "aria-controls": "lpa-panel-" + section.key,
        tabIndex: active === section.key ? 0 : -1,
        className: "lpa-nav-item" + (active === section.key ? " lpa-nav-item--active" : ""),
        onClick: () => select(section.key)
      }, p.t(section.label)))
    ),
    h12(
      "header",
      { className: "lpa-settings-header" },
      h12("div", { className: "lpa-settings-heading" }, h12("h1", null, p.t("title")), h12("p", { className: "lpa-note lpa-settings-subtitle" }, p.t("settings.subtitle"))),
      p.returnToConversation ? h12("button", { type: "button", className: "lpa-button", onClick: p.returnToConversation }, p.t("returnConversation")) : null
    ),
    h12(
      "div",
      { className: "lpa-settings-panels" },
      sections.map((section) => h12("div", {
        key: section.key,
        role: "tabpanel",
        id: "lpa-panel-" + section.key,
        "aria-labelledby": "lpa-tab-" + section.key,
        hidden: active !== section.key,
        className: "lpa-settings-panel"
      }, section.render()))
    )
  );
}
var import_react13, h12, SECTION_KEY, readSection, writeSection;
var init_settings_page = __esm({
  "assist/client/settings-page.js"() {
    init_update_panel();
    init_model_style_pref();
    import_react13 = __toESM(require("react"), 1);
    init_settings();
    init_runtime();
    init_api();
    init_enablement_panel();
    init_enablement_source();
    init_priority_panel();
    init_settings_page_state();
    h12 = import_react13.default.createElement;
    SECTION_KEY = "lpa_settings_section";
    readSection = () => {
      try {
        return localStorage.getItem(SECTION_KEY) || "assist";
      } catch {
        return "assist";
      }
    };
    writeSection = (value) => {
      try {
        localStorage.setItem(SECTION_KEY, value);
      } catch {
      }
    };
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

// assist/client/model-descriptions-data.json
var model_descriptions_data_default;
var init_model_descriptions_data = __esm({
  "assist/client/model-descriptions-data.json"() {
    model_descriptions_data_default = {
      version: 1,
      fallback: "en",
      brands: {
        note: "Which brand mark a row shows. Every id names a vendored lockup in packages/assets/src/icons/combine/; scripts/build.mjs fails the build on an id that is not there. This is presentation data, kept out of the bundle like the rest of this document, and it is separate from the copy rules above: a vendor's mark and a vendor's description line change for different reasons. `providers` is deliberately empty: a model no rule claims draws **no** lockup rather than its provider's, because the reseller's own lockup on a model it did not make reads as a wrong answer rather than a missing one. `models` is an ordered, anchored rule list resolved against the model id, exactly like `families` and with the same discipline: first match wins, so a broad rule must sit below the narrow ones and every rule must name its vendor (`step` cannot match `step-3.7-flash` by accident only if no earlier rule already claimed it). A brand with no lockup renders the label without a mark.",
        providers: {},
        models: [
          { match: "deepseek", brand: "deepseek" },
          {
            match: "claude",
            brand: "claude",
            note: "Claude rows draw Claude's own lockup, not the parent Anthropic one: the label names the model line, and a wordmark has to match the word it stands in for \u2014 the same reason Grok rows draw Grok's rather than xAI's. Anthropic stays the fallback for the `anthropic` route."
          },
          { match: "gpt|(^|[^a-z0-9])o[1-9](-|$)", brand: "openai" },
          {
            match: "nano-?banana",
            brand: "nanobanana",
            note: "Nano Banana is a Gemini image model with its own identity in the catalog, so it draws its own lockup rather than the Gemini one."
          },
          {
            match: "gemma",
            brand: "gemma",
            note: "Gemma is Google's open model line, so it draws its own lockup rather than the parent Google one \u2014 the same reason Claude and Grok do."
          },
          {
            match: "gemini",
            brand: "gemini",
            note: "A Gemini row shows the model line's mark; the provider group header above it shows Google's, because providers resolve from `providers` and never from here."
          },
          { match: "glm", brand: "zai" },
          {
            match: "kimi|(^|[^a-z0-9])k3($|-)",
            brand: "kimi",
            note: "The id can carry the serving provider's namespace (`cn:k3`, `moonshot/k3`), so the segment start accepts any character outside a letter or a digit. Requiring `k3` to start a segment is what leaves `mk3` unclaimed."
          },
          { match: "qwen", brand: "qwen" },
          { match: "step", brand: "stepfun" },
          {
            match: "minimax|(^|[^a-z0-9])m[23]($|-)",
            brand: "minimax",
            note: "The id can carry the serving provider's namespace (`cn:m3`), so the segment start accepts any character outside a letter or a digit. Requiring `m2` or `m3` to start a segment is what leaves `pm2` unclaimed."
          },
          { match: "muse-spark|llama", brand: "meta" },
          { match: "celeris", brand: "celestoai" },
          { match: "mercury|inception", brand: "inception" },
          {
            match: "grok",
            brand: "grok",
            note: "Grok is the model line, xAI the company: a Grok row shows Grok's own mark, while the provider group header above it still shows xAI's, because providers resolve from `providers` and never from here."
          },
          { match: "doubao|seed|volc", brand: "bytedance" },
          { match: "ernie", brand: "baidu" },
          {
            match: "hunyuan|(^|[^a-z0-9])hy(\\d|-?mt)",
            brand: "tencent",
            note: "The id can carry the serving provider's namespace (`cn:hy3`, `openrouter/hy3`), so the segment start accepts any character outside a letter or a digit. Requiring `hy` to start a segment is what leaves `shy-mt2` unclaimed."
          },
          { match: "mistral|magistral|codestral", brand: "mistral" },
          { match: "north|command-?[ar]|cohere", brand: "cohere" },
          { match: "phi-?\\d", brand: "microsoft" },
          {
            match: "(^|[^a-z0-9])nova(-|$)",
            brand: "nova",
            note: "The vendor name has to start a segment and end one: unanchored, this rule claims `sensenova-6.8-flash-lite` for Amazon and lands that lockup in the middle of the name."
          },
          { match: "mimo", brand: "xiaomimimo" },
          { match: "longcat", brand: "longcat" },
          { match: "sonar|perplexity", brand: "perplexity" },
          {
            match: "beam",
            brand: "reflection",
            note: "Beam is Reflection's own line, so its rows draw the vendor's lockup \u2014 whose word is the vendor's, and the catalog's own name never spells it (`Beam Free \xB7 OpenCode Go`), so the label leads with the lockup instead of replacing a word in it."
          }
        ],
        lockups: {
          note: "Per-brand overrides for the vendored lockup, applied by scripts/fetch-lobe-combines.py. `word` is the word the lockup stands in for inside a model name (it must match how the catalog spells it, which is not always Lobe's TITLE), `mark` and `text` name the Lobe icons the two halves are taken from (so a model line can wear its own mark with its parent's wordmark), `keep` crops a wordmark to a fraction of its ink width (GLM-V's \"-V\" is not part of the name), and `tint` is the brand colour a hand-provided mark wears on the ivory canvas, where a fetched mark carries Lobe's own.",
          meta: { word: "Meta", lockup: true },
          openai: { word: "GPT", local: "openai.svg", textFrom: 0.529 },
          tencent: { word: "Hunyuan", mark: "hunyuan", text: "tencent" },
          stepfun: { word: "Step", mark: "stepfun", text: "stepfun" },
          xiaomimimo: { word: "MiMo", mark: "xiaomimimo", text: "xiaomimimo" },
          nanobanana: { word: "Nano Banana" },
          zai: { word: "GLM", mark: "zai", text: "glmv", keep: 0.62 },
          reflection: { word: "Reflection", tint: "#1e3207" }
        }
      },
      families: [
        {
          match: "deepseek.*flash",
          text: {
            zh: "\u975E\u5BF9\u79F0\u6A21\u578B\u7ED3\u6784\uFF0C\u5C0F\u6210\u672C\u5927\u667A\u80FD\u3002",
            en: "Asymmetric architecture: more intelligence, less cost."
          },
          note: "Every DeepSeek Flash reads the same line: the copy describes the line, not a version, so a retired Flash and a future one say the same thing. Anchored on `deepseek` on purpose: an unanchored /flash$/ would hand this copy to glm-5.3-flash, step-3.7-flash and every other vendor's flash tier."
        },
        {
          match: "deepseek.*pro",
          note: "The Pro line's own official heading on the V4 preview page. No rule pins it to a version: a Pro is a Pro whatever its version.",
          text: {
            zh: "\u6027\u80FD\u6BD4\u80A9\u9876\u7EA7\u95ED\u6E90\u6A21\u578B\u3002",
            en: "Performance rivaling the world's top closed-source models."
          }
        },
        {
          match: "deepseek",
          note: "Everything else in the line \u2014 V3.2, R1, and whatever comes next \u2014 shares the V4.1 release title.",
          text: {
            zh: "\u66F4\u5F3A\u3001\u66F4\u5FEB\u3001\u66F4\u666E\u60E0\u3002",
            en: "Smarter, faster, more affordable."
          }
        },
        {
          match: "claude.*fable",
          note: "Fable is a model line of its own (Mythos / Fable / Opus / Sonnet / Haiku), so it must not fall through to the generic Claude rule. Its copy is the line tagline from anthropic.com/claude/fable, and it carries no tier prefix of ours.",
          text: {
            zh: "\u65B0\u4E00\u4EE3\u667A\u80FD\uFF0C\u4E13\u4E3A\u89E3\u51B3\u6700\u8270\u6DF1\u7684\u77E5\u8BC6\u5DE5\u4F5C\u548C\u7F16\u7A0B\u96BE\u9898\u3002",
            en: "Next generation of intelligence for the hardest knowledge work and coding problems."
          }
        },
        {
          match: "claude.*mythos",
          note: "Mythos is Fable's unrestricted sibling \u2014 Anthropic's own words: Fable is the same underlying model with cybersecurity and biology safeguards added. Access to Mythos is limited to vetted organizations, so its copy leads with the audience rather than the capability.",
          text: {
            zh: "\u9762\u5411\u7F51\u7EDC\u5B89\u5168\u4E0E\u751F\u7269\u5B66\u7814\u7A76\u7684\u53EF\u9760\u6A21\u578B\u3002",
            en: "Built for cybersecurity and biology research, with access limited to vetted organizations."
          }
        },
        {
          match: "claude.*opus",
          note: "Family copy stays version-agnostic, so it carries no superlatives: 'strongest' is only true of the current generation and would mislabel an older Opus. Superlatives belong in a rule anchored to the version. It also carries no tier prefix of ours \u2014 '\u65D7\u8230\u6863\uFF1A' is our positioning, not the model's own line.",
          text: {
            zh: "\u9762\u5411\u590D\u6742\u7F16\u7A0B\u4E0E AI \u667A\u80FD\u4F53\u7684\u6DF7\u5408\u63A8\u7406\u6A21\u578B\u3002",
            en: "A hybrid reasoning model built for serious coding and AI agents."
          }
        },
        {
          match: "claude.*sonnet",
          text: {
            zh: "\u9762\u5411\u5B9E\u65F6\u667A\u80FD\u4F53\u4E0E\u9AD8\u541E\u5410\u7684\u6DF7\u5408\u63A8\u7406\u6A21\u578B\u3002",
            en: "Hybrid reasoning for real-time agents and high-volume work."
          }
        },
        {
          match: "claude.*haiku",
          text: {
            zh: "\u9762\u5411\u901F\u5EA6\u654F\u611F\u7684\u9AD8\u541E\u5410\u573A\u666F\uFF0C\u54CD\u5E94\u5FEB\u3001\u6210\u672C\u4F4E\u3002",
            en: "For speed-sensitive, high-volume workloads at low cost."
          }
        },
        {
          match: "claude",
          text: { zh: "Anthropic Claude \u6A21\u578B\u3002", en: "Anthropic Claude model." }
        },
        {
          match: "codex",
          text: {
            zh: "\u4E3A Codex \u667A\u80FD\u4F53\u7F16\u7A0B\u4F18\u5316\uFF0C\u53EF\u5E76\u884C\u5904\u7406\u591A\u9879\u8F6F\u4EF6\u5DE5\u7A0B\u4EFB\u52A1\u3002",
            en: "Optimized for agentic coding in Codex, handling several software tasks in parallel."
          }
        },
        {
          match: "gpt[._-]?5[._-]?4(?!\\d)",
          note: "Anchored to the 5.4 generation: the context size and the computer use are that model's, so a later GPT-5 reads the rule below.",
          text: {
            zh: "\u9762\u5411\u7F16\u7A0B\u4E0E\u4E13\u4E1A\u5DE5\u4F5C\u7684\u957F\u4E0A\u4E0B\u6587\u6A21\u578B\u3002",
            en: "For coding and professional work, with a 1.05M-token context and native computer use."
          }
        },
        {
          match: "gpt-?5",
          text: {
            zh: "\u5185\u7F6E\u601D\u8003\u3001\u53EF\u914D\u7F6E\u63A8\u7406\u5F3A\u5EA6\uFF0C\u9762\u5411\u7F16\u7A0B\u4E0E\u667A\u80FD\u4F53\u4EFB\u52A1\u3002",
            en: "Thinking built in with configurable reasoning effort, for coding and agentic tasks."
          }
        },
        {
          match: "(^|[/-])o[1-9](-|$)",
          text: {
            zh: "\u4F5C\u7B54\u524D\u6DF1\u5165\u601D\u8003\uFF0C\u4ECE o1 \u5230 o3 \u4E0E o4-mini\u3002",
            en: "Trained to think more deeply before responding, from o1 through o3 and o4-mini."
          }
        },
        {
          match: "gpt-oss|oss-\\d",
          text: {
            zh: "OpenAI \u5F00\u53D1\u7684\u5F00\u653E\u6743\u91CD\u63A8\u7406\u6A21\u578B\u3002",
            en: "Open-weight reasoning models, Apache 2.0, in 120B and 20B sizes, customizable and self-hostable."
          }
        },
        { match: "gpt", text: { zh: "\u652F\u6301\u6587\u672C\u4E0E\u56FE\u50CF\u8F93\u5165\u3001\u591A\u8BED\u8A00\u3002", en: "Text and image input, multilingual." } },
        {
          match: "gemini.*(pro|ultra|Argon)",
          text: {
            zh: "\u9762\u5411\u590D\u6742\u4EFB\u52A1\u3001\u6DF1\u5EA6\u63A8\u7406\u4E0E\u591A\u6A21\u6001\u7406\u89E3\u3002",
            en: "For complex tasks, deep reasoning and multimodal understanding."
          }
        },
        {
          match: "gemini.*flash",
          text: {
            zh: "\u901F\u5EA6\u4E0E\u6210\u672C\u4F18\u5148\uFF0C\u9762\u5411\u89C4\u6A21\u5316\u667A\u80FD\u4F53\u4EFB\u52A1\u4E0E\u9AD8\u9891\u4F4E\u5EF6\u8FDF\u573A\u666F\u3002",
            en: "Speed and cost first, for high-volume low-latency work and agentic tasks at scale."
          }
        },
        { match: "gemini", text: { zh: "\u539F\u751F\u7406\u89E3\u6587\u672C\u3001\u56FE\u50CF\u3001\u89C6\u9891\u4E0E\u97F3\u9891\u3002", en: "Native text, image, video and audio understanding." } },
        {
          match: "gemma",
          note: "Gemma is Google's open line, not a Gemini tier, so it must not inherit the Gemini rule's copy. Its place below the generic Gemini rule is only for readability: the two patterns cannot overlap.",
          text: {
            zh: "\u6E90\u81EA Gemini \u7814\u7A76\uFF0C\u4ECE\u4E91\u7AEF\u670D\u52A1\u5668\u5230\u624B\u673A\u90FD\u80FD\u8FD0\u884C\u3002",
            en: "Built from the same research as Gemini, running from cloud servers to phones."
          }
        },
        {
          match: "nano-?banana",
          note: "Nano Banana is Gemini's image model with its own catalog identity, so it gets image copy instead of the Gemini text-model line.",
          text: {
            zh: "Gemini \u56FE\u50CF\u751F\u6210\u4E0E\u7F16\u8F91\u6A21\u578B\uFF0C\u652F\u6301\u81EA\u7136\u8BED\u8A00\u5BF9\u8BDD\u5F0F\u521B\u5EFA\u4E0E\u4FEE\u6539\u3002",
            en: "Gemini's image generation and editing model, with conversational creation and refinement."
          }
        },
        {
          match: "glm[._-]?5[._-]?3.*flashx",
          note: "Anchored to the 5.3 generation: the throughput figure is that tier's, so a later GLM Flash X reads the generic Flash rule below.",
          text: {
            zh: "GLM 5.3 flash\u7684\u9AD8\u541E\u5410\u7248\u672C\u3002",
            en: "A high-throughput variant running at 200 tokens/s."
          }
        },
        {
          match: "glm[._-]?5[._-]?3.*flash",
          note: "Anchored to the 5.3 generation's Flash tier; a later GLM Flash reads the generic Flash rule below.",
          text: {
            zh: "GLM-5\u7CFB\u5217\u7684\u9996\u4E2A\u539F\u751F\u591A\u6A21\u6001\u6A21\u578B\u3002",
            en: "Natively multimodal, with 320B/18B MoE, 1M context and MIT licensing at $0.045 per task."
          }
        },
        {
          match: "glm[._-]?5[._-]?3(?!\\d)",
          note: "Anchored to the 5.3 generation: the superlative is true of it alone, and the line's own rule below carries none.",
          text: {
            zh: "\u6700\u5F3A\u5F00\u653E\u6743\u91CD\u7F16\u7A0B\u6A21\u578B\u4E4B\u4E00\uFF0C\u62D3\u5C55\u667A\u80FD\u4E0A\u754C\u7684\u53EF\u53CA\u8FB9\u754C\u3002",
            en: "For coding and long-horizon autonomy: 1M context, 128K output, and post-training alone makes it the most capable open-weight coding model."
          }
        },
        {
          match: "glm.*flash",
          text: {
            zh: "\u66F4\u5FEB\u66F4\u7701\u7684\u591A\u6A21\u6001\u63A8\u7406\uFF0C\u517C\u987E\u957F\u4E0A\u4E0B\u6587\u4E0E\u65E5\u5E38\u7F16\u7A0B\u3002",
            en: "Fast, low-cost multimodal inference with long context and everyday coding."
          }
        },
        {
          match: "glm",
          text: {
            zh: "\u8986\u76D6\u5BF9\u8BDD\u3001\u7F16\u7A0B\u4E0E\u667A\u80FD\u4F53\uFF0C\u652F\u6301\u601D\u8003\u6A21\u5F0F\u4E0E\u51FD\u6570\u8C03\u7528\u3002",
            en: "Covers chat, coding and agents, with thinking mode and function calling."
          }
        },
        {
          match: "kimi.*(k3|k-?3)|(^|[^a-z0-9])k-?3",
          note: "Anchored to the K3 line: the 2.8T size belongs to it, and the catalog's `k3` and `k3-256k` spellings are the same line. The K3 mentions carry the same segment start as the lockup rule, so an id spelled `cn:k3` reads this line.",
          text: {
            zh: "\u9762\u5411\u7F16\u7A0B\u4E0E\u77E5\u8BC6\u5DE5\u4F5C\u7684 2.8T \u5F00\u653E\u6743\u91CD\u6A21\u578B\u3002",
            en: "An open-weight 2.8T model for coding and knowledge work."
          }
        },
        {
          match: "kimi.*(cod(e|ing)|k2[._-]?7).*highspeed",
          note: "The coding line's high-speed tier, above the coding rule because its own id contains `coding`.",
          text: {
            zh: "\u9762\u5411\u957F\u7A0B\u7F16\u7A0B\u7684\u5F00\u653E\u6743\u91CD\u667A\u80FD\u4F53\u6A21\u578B\u9AD8\u901F\u7248\u3002",
            en: "A high-speed variant at about 180 tokens/s, 5\u20136x the regular tier, for 2x the price."
          }
        },
        {
          match: "kimi.*(cod(e|ing)|k2[._-]?7)",
          note: "The coding line whatever the suffix spells: `kimi-for-coding` and `kimi-k2.7-code` both read it, and the high-speed tier above is claimed first.",
          text: {
            zh: "\u9762\u5411\u957F\u7A0B\u7F16\u7A0B\u7684\u5F00\u653E\u6743\u91CD\u667A\u80FD\u4F53\u6A21\u578B\u3002",
            en: "An open-weight agentic coding model for long-horizon work, 1T/32B with 256K context."
          }
        },
        {
          match: "kimi",
          text: {
            zh: "\u539F\u751F\u652F\u6301\u6587\u672C\u3001\u56FE\u50CF\u4E0E\u89C6\u9891\u8F93\u5165\uFF0C\u542B\u601D\u8003\u6A21\u5F0F\u4E0E\u5DE5\u5177\u8C03\u7528\u3002",
            en: "Native text, image and video input, with thinking mode and tool calling."
          }
        },
        {
          match: "qwen[._-]?3[._-]?8.*max",
          note: "Anchored to the 3.8 generation: the parameter count and the context are that model's, so a later Qwen Max falls to the line rule below.",
          text: {
            zh: "\u9762\u5411\u7F16\u7A0B\u4E0E\u529E\u516C\uFF0C2.4 \u4E07\u4EBF\u53C2\u6570 MoE\uFF0C1M \u4E0A\u4E0B\u6587\u3001\u601D\u8003\u6A21\u5F0F\u4E0E\u5185\u7F6E\u5DE5\u5177\u3002",
            en: "A 2.4T-parameter MoE for coding and office work, with 1M context, thinking mode and built-in tools."
          }
        },
        {
          match: "qwen.*(coder|code)",
          text: {
            zh: "\u5F00\u653E\u6743\u91CD MoE\uFF0C\u9762\u5411\u8865\u5168\u3001\u751F\u6210\u4E0E\u4ED3\u5E93\u7EA7\u4FEE\u6539\u3002",
            en: "Open-weight MoE for completion, generation and repo-level edits."
          }
        },
        {
          match: "qwen.*(flash|turbo)",
          text: {
            zh: "\u54CD\u5E94\u5FEB\u3001\u6210\u672C\u4F4E\uFF0C\u5DE5\u5177\u8C03\u7528\u4E0E\u957F\u4E0A\u4E0B\u6587\u652F\u6301\u5B8C\u6574\u3002",
            en: "Fast and cheap, with full tool calling and long-context support."
          }
        },
        {
          match: "qwen.*plus",
          text: {
            zh: "\u80FD\u529B\u4E0E\u6210\u672C\u5747\u8861\uFF0C\u5B8C\u6574\u5DE5\u5177\u8C03\u7528\u652F\u6301\u3002",
            en: "Balanced cost and capability with full tool calling."
          }
        },
        {
          match: "qwen.*a\\d+b",
          note: "MoE ids spell out total and active parameters (`2.4t-a95b`, `235b-a22b`); the active count must win over the size rule below, which would otherwise read the trailing `95b` as a small dense model.",
          text: {
            zh: "\u603B\u53C2\u5927\u3001\u6FC0\u6D3B\u53C2\u6570\u5C11\uFF0C\u5355\u4F4D\u6210\u672C\u4F4E\u4E8E\u540C\u89C4\u6A21\u7A20\u5BC6\u6A21\u578B\u3002",
            en: "Many total parameters but few active, so it costs less than a dense model of the same size."
          }
        },
        {
          match: "qwen.*[-_]\\d+b($|[^a-z])",
          note: "Anchored to a separator so the digits start a segment: an unanchored \\d+b matches the `95b` inside `a95b` and calls a 2.4T MoE a small dense model.",
          text: {
            zh: "\u53EF\u672C\u5730\u6216\u4F4E\u6210\u672C\u90E8\u7F72\u3002",
            en: "Cheap to serve, or run locally."
          }
        },
        {
          match: "qwen",
          text: { zh: "\u5F00\u653E\u6743\u91CD\u4E0E\u4E91\u7AEF API \u5E76\u884C\uFF0C\u8986\u76D6\u6587\u672C\u3001\u56FE\u50CF\u3001\u97F3\u9891\u4E0E\u89C6\u9891\u3002", en: "Open weights and cloud APIs across text, image, audio and video." }
        },
        {
          match: "step[._-]?5(?!\\d)",
          note: "Anchored to the 5 line: the input modes and the context are its own, and the trailing-digit guard keeps a size suffix (`95b`) from reading it.",
          text: {
            zh: "\u9762\u5411\u7F16\u7A0B\u4E0E\u4E13\u4E1A\u77E5\u8BC6\u5DE5\u4F5C\uFF0C\u539F\u751F\u56FE\u6587\u89C6\u9891\u8F93\u5165\uFF0C1M \u4E0A\u4E0B\u6587\u3002",
            en: "For programming and professional knowledge work, with native text, image and video input and a 1M-token context."
          }
        },
        {
          match: "step[._-]?3[._-]?7.*flash",
          note: "Anchored to 3.7: the parameter counts and the token rate are that tier's, so another Step Flash falls to the line rule below.",
          text: {
            zh: "\u9762\u5411\u667A\u80FD\u4F53\u4E0E\u4EE3\u7801\u4EFB\u52A1\uFF0C198B/11B \u7A00\u758F MoE\uFF0C\u56FE\u50CF\u4E0E\u89C6\u9891\u7406\u89E3\uFF0C256K \u4E0A\u4E0B\u6587\uFF0C\u6700\u9AD8 400 tokens/s\u3002",
            en: "For agentic and coding tasks: 198B/11B sparse MoE with image and video understanding, 256K context, up to 400 tokens/s."
          }
        },
        { match: "step", text: { zh: "\u8986\u76D6\u6587\u672C\u63A8\u7406\u3001\u591A\u6A21\u6001\u4E0E\u8BED\u97F3\uFF0C\u7ECF\u5B98\u65B9\u5F00\u653E\u5E73\u53F0\u63D0\u4F9B\u3002", en: "Reasoning, multimodal understanding and voice, served through the official open platform." } },
        {
          match: "minimax.*m3|(^|[^a-z0-9])m3($|-)",
          note: "The M3 line's own claims; the catalog's `minimax-m3-1m` is the same line at a longer context.",
          text: {
            zh: "\u9996\u4E2A\u96C6\u524D\u6CBF\u7F16\u7A0B\u30011M \u4E0A\u4E0B\u6587\u4E0E\u539F\u751F\u591A\u6A21\u6001\u4E8E\u4E00\u8EAB\u7684\u5F00\u653E\u6743\u91CD\u6A21\u578B\u3002",
            en: "The first open-weight model combining frontier coding, 1M context and native multimodality."
          }
        },
        {
          match: "minimax|(^|[^a-z0-9])m2[-.]?\\d",
          text: {
            zh: "\u4E3B\u6253\u667A\u80FD\u4F53\u63A8\u7406\u3001\u5DE5\u5177\u8C03\u7528\u3001\u7F16\u7A0B\u4E0E\u591A\u6A21\u6001\u8F93\u5165\uFF0C\u9762\u5411\u957F\u4E0A\u4E0B\u6587\u4EFB\u52A1\u3002",
            en: "Agentic reasoning, tool use, coding and multimodal input for long-context work."
          }
        },
        {
          match: "muse-spark",
          note: "Meta Superintelligence Labs' Muse line, separate from the Llama open-weight line \u2014 it must not inherit the Llama rule's copy.",
          text: {
            zh: "\u5C0F\u800C\u5FEB\u3001\u539F\u751F\u591A\u6A21\u6001\u63A8\u7406\uFF0C\u9A71\u52A8 Meta AI\u3002",
            en: "Small and fast by design, natively multimodal, powering Meta AI."
          }
        },
        {
          match: "celeris[._-]?1(-|$)",
          note: "Anchored to Celeris-1: the numbers are that model's, so a future Celeris reads the line rule below.",
          text: {
            zh: "\u751F\u6210\u901F\u5EA6 1,664 tokens/s\uFF0C\u8D85\u8FC7 Mercury 2 \u7684 5 \u500D\uFF0CMMLU-Pro 75.9%\u3002",
            en: "Generates 1,664 tokens/s, over 5x Mercury 2, at 75.9% MMLU-Pro."
          }
        },
        {
          match: "celeris",
          note: "Diffusion LLM, so the copy leads with latency rather than the usual capability framing.",
          text: {
            zh: "\u6269\u6563\u67B6\u6784\u5927\u8BED\u8A00\u6A21\u578B\uFF0C\u4E3B\u6253\u8D85\u4F4E\u5EF6\u8FDF\u751F\u6210\u3002",
            en: "Diffusion-architecture LLMs built for ultra-low-latency generation."
          }
        },
        {
          match: "mercury-?\\d|inception",
          text: {
            zh: "\u9762\u5411\u4EE3\u7801\u751F\u6210\uFF0CH100 \u4E0A\u8D85 1,000 tokens/s\uFF0C\u901F\u5EA6\u6700\u9AD8\u4E3A\u540C\u7C7B\u6A21\u578B\u7684 10 \u500D\u3002",
            en: "Built for code, over 1,000 tokens/s on H100, up to 10x faster than speed-optimized LLMs."
          }
        },
        {
          match: "apodex",
          text: {
            zh: "\u9762\u5411\u590D\u6742\u4E13\u4E1A\u5DE5\u4F5C\u3001\u91D1\u878D\u4E0E\u79D1\u7814\uFF0C1.1 mini \u4E3A 35B\u3001\u53EF\u672C\u5730\u90E8\u7F72\u3002",
            en: "For complex professional work, finance and science; the 35B 1.1 mini runs locally."
          }
        },
        {
          match: "motif",
          text: {
            zh: "MIT \u8BB8\u53EF\uFF0C314B \u603B\u53C2 / 13.2B \u6FC0\u6D3B\uFF0C256K \u4E0A\u4E0B\u6587\u3002",
            en: "MIT-licensed, 314B total / 13.2B active, 256K context."
          }
        },
        {
          match: "grok[._-]?4(?!\\d)",
          note: "Anchored to the Grok 4 line, so every 4.x build reads the same sentence and another line falls to the rule below.",
          text: {
            zh: "\u5168\u7403\u6700\u667A\u80FD\u7684\u6A21\u578B\u4E4B\u4E00\uFF0C\u652F\u6301\u539F\u751F\u5DE5\u5177\u4F7F\u7528\u4EE5\u53CA\u5B9E\u65F6\u641C\u7D22\u529F\u80FD\u3002",
            en: "One of the most intelligent models in the world, with native tool use and real-time search."
          }
        },
        {
          match: "grok",
          text: {
            zh: "\u8986\u76D6\u7F16\u7A0B\u3001\u667A\u80FD\u4F53\u4E0E\u77E5\u8BC6\u5DE5\u4F5C\uFF0CAPI \u652F\u6301\u591A\u6A21\u6001\u8F93\u5165\u3002",
            en: "Coding, agentic tasks and knowledge work, with multimodal API input."
          }
        },
        {
          match: "doubao.*2[._-]?1(?!\\d)|seed[._-]?2[._-]?1(?!\\d)",
          note: "Anchored to Seed 2.1: the tiers it names are that generation's, so another Seed reads the vendor rule below.",
          text: {
            zh: "\u5206 Pro \u4E0E Turbo \u4E24\u6863\u7684\u65B0\u4E00\u4EE3\u751F\u4EA7\u529B\u667A\u80FD\u4F53\uFF0C\u4EE5\u901A\u7528\u4EFB\u52A1\u4E0E\u4EE3\u7801\u89C1\u957F\u3002",
            en: "Pro and Turbo tiers of a next-generation productivity agent, strong at general agentic and coding tasks."
          }
        },
        {
          match: "doubao|seed-?\\d|volc",
          text: {
            zh: "\u7ECF 50+ \u5185\u90E8\u4E1A\u52A1\u573A\u666F\u9A8C\u8BC1\uFF0C\u6BCF\u65E5\u5343\u4EBF\u7EA7 token \u7528\u91CF\u6253\u78E8\uFF0C\u652F\u6301\u591A\u6A21\u6001\u3002",
            en: "Validated across 50+ internal scenarios and hundreds of billions of daily tokens, with multimodal support."
          }
        },
        {
          match: "ernie[._-]?5([._-]?0)?(-|$)",
          note: "Anchored to the 5.0 generation: the parameter count is its own, and the catalog's `ernie-5` is the same line.",
          text: {
            zh: "2.4 \u4E07\u4EBF\u53C2\u6570\u7684\u539F\u751F\u5168\u6A21\u6001\u5927\u6A21\u578B\u3002",
            en: "A native omni-modal model with 2.4 trillion parameters."
          }
        },
        {
          match: "ernie",
          text: {
            zh: "\u4EA7\u4E1A\u7EA7\u77E5\u8BC6\u589E\u5F3A\uFF0C\u652F\u6301\u4E2D\u6587\u7406\u89E3\u4E0E\u591A\u6A21\u6001\u751F\u6210\u3002",
            en: "Industry-grade knowledge enhancement, with Chinese understanding and multimodal generation."
          }
        },
        {
          match: "hunyuan|(^|[^a-z0-9])hy\\d",
          text: {
            zh: "\u4E2D\u6587\u7406\u89E3\u4E0E\u667A\u80FD\u4F53\u573A\u666F\u8868\u73B0\u5747\u8861\u3002",
            en: "Balanced for Chinese language and agentic scenarios."
          },
          note: "The brand rule for this line reads the same segment start: `cn:hy3` is the same line as `hy3`."
        },
        {
          match: "codestral",
          text: { zh: "\u9762\u5411\u8865\u5168\u3001FIM \u4E0E\u751F\u6210\uFF0C128K \u4E0A\u4E0B\u6587\u3002", en: "Built for completion, FIM and generation, with 128K context." }
        },
        {
          match: "mistral.*large[._-]?3(?!\\d)",
          note: "Anchored to Large 3: the licence and the parameter counts are that model's, so another Mistral reads the line rule below.",
          text: {
            zh: "Apache 2.0 \u5F00\u653E\u6743\u91CD\u591A\u6A21\u6001\u6A21\u578B\uFF0C\u7EC6\u7C92\u5EA6 MoE\uFF0C675B \u603B\u53C2 / 41B \u6FC0\u6D3B\uFF0C256K \u4E0A\u4E0B\u6587\u3002",
            en: "Apache-2.0 open-weight multimodal MoE with 675B total / 41B active parameters and 256K context."
          }
        },
        {
          match: "mistral|magistral",
          text: {
            zh: "\u4ECE\u4E91\u7AEF\u5230\u8FB9\u7F18\u7684\u524D\u6CBF\u6A21\u578B\uFF0C\u5F00\u653E\u6743\u91CD\u4E0E\u5546\u7528\u5E76\u884C\uFF0C\u53EF API \u8C03\u7528\u6216\u81EA\u6258\u7BA1\u3002",
            en: "Frontier models from cloud to edge, open-weight and commercial, via API or self-hosting."
          }
        },
        { match: "llama", text: { zh: "\u53EF\u81EA\u7531\u5FAE\u8C03\u3001\u84B8\u998F\u5E76\u90E8\u7F72\u5230\u4EFB\u4F55\u73AF\u5883\u3002", en: "Fine-tune, distill and deploy it anywhere." } },
        {
          match: "north",
          text: {
            zh: "\u6574\u5408\u5927\u6A21\u578B\u3001\u641C\u7D22\u4E0E\u81EA\u52A8\u5316\u6210\u4E00\u4E2A\u4F01\u4E1A\u7EA7\u5B89\u5168\u5DE5\u4F5C\u7A7A\u95F4\u3002",
            en: "LLMs, search and automation combined into one secure enterprise workspace."
          }
        },
        {
          match: "command-?[ar]|cohere",
          text: {
            zh: "\u9762\u5411\u5DE5\u5177\u8C03\u7528\u3001RAG \u4E0E\u591A\u8BED\u8A00\uFF0CCommand A \u4E3A 111B/256K\u3002",
            en: "For tool use, RAG and multilingual work; Command A is 111B with 256K context."
          }
        },
        {
          match: "phi-?\\d",
          text: { zh: "\u9762\u5411\u8FB9\u7F18\u4E0E\u672C\u5730\u90E8\u7F72\uFF0CPhi-4 \u4EE5 14B \u4E13\u6CE8\u63A8\u7406\u3001\u6570\u5B66\u4E0E\u4EE3\u7801\u3002", en: "For edge and local use; Phi-4 (14B) targets reasoning, math and code." }
        },
        {
          match: "(^|[^a-z0-9])nova(-|$)",
          note: "Every mention of the line reads the same boundary as the lockup rule: unanchored, this rule gives `sensenova-6.8-flash-lite` Amazon Nova's description.",
          text: { zh: "Micro/Lite/Pro/Premier \u56DB\u6863\uFF0C\u652F\u6301\u6587\u672C\u3001\u56FE\u50CF\u4E0E\u89C6\u9891\u8F93\u5165\u3002", en: "Micro, Lite, Pro and Premier tiers taking text, image and video." }
        },
        {
          match: "sonar|perplexity",
          text: { zh: "\u7ED3\u5408\u5B9E\u65F6\u7F51\u7EDC\u4FE1\u606F\u4E0E\u5F15\u7528\u7684\u641C\u7D22 API\uFF0C\u4ECE\u8F7B\u91CF Sonar \u5230\u591A\u6B65\u6DF1\u7814 Sonar Pro\u3002", en: "Search APIs answering with fresh web data and citations, from light Sonar to deep-research Sonar Pro." }
        }
      ],
      tiers: [
        {
          match: "flash|mini|lite|nano|turbo|air|small|swift|highspeed|fast|instant",
          text: {
            zh: "\u54CD\u5E94\u5FEB\u3001\u6210\u672C\u4F4E\uFF0C\u9002\u5408\u7B80\u5355\u6216\u9AD8\u9891\u4EFB\u52A1\u3002",
            en: "Fast and cheap, for simple or high-frequency tasks."
          }
        },
        {
          match: "pro|max|ultra|opus|thinking|reasoner|plus|large|advanced|heavy|frontier",
          text: {
            zh: "\u9002\u5408\u590D\u6742\u6216\u8D28\u91CF\u4F18\u5148\u7684\u4EFB\u52A1\uFF0C\u6210\u672C\u66F4\u9AD8\u3002",
            en: "For complex, quality-first work at higher cost."
          }
        },
        {
          match: "a\\d+b",
          note: "MoE active-parameter suffix (`a95b`, `a23b`); tried before the dense rule so the active count is not mistaken for a total.",
          text: {
            zh: "\u603B\u53C2\u5927\u3001\u6FC0\u6D3B\u53C2\u6570\u5C11\uFF0C\u5355\u4F4D\u6210\u672C\u4F4E\u4E8E\u540C\u89C4\u6A21\u7A20\u5BC6\u6A21\u578B\u3002",
            en: "Many total parameters but few active, so it costs less than a dense model of the same size."
          }
        },
        {
          match: "(^|[-_])\\d+b($|[^a-z])",
          note: "Anchored so the digits start a segment: unanchored, `a95b` and `a23b` read as small dense models.",
          text: {
            zh: "\u53EF\u672C\u5730\u6216\u4F4E\u6210\u672C\u90E8\u7F72\u3002",
            en: "Cheap to serve, or run locally."
          }
        }
      ]
    };
  }
});

// assist/client/model-descriptions.js
function familyCopy(provider, id2) {
  for (const candidate of [id2, `${String(provider ?? "").toLowerCase()}/${id2}`]) {
    for (const rule of families) if (rule.re.test(candidate)) return rule.text;
  }
  return null;
}
function localized(pair, locale) {
  if (!pair) return "";
  const language = typeof locale === "string" && locale ? locale : "en";
  const prefix = language.includes("-") ? language.split("-")[0] : language.includes("_") ? language.split("_")[0] : "";
  const fallbackPrefix = fallbackLocale.includes("-") ? fallbackLocale.split("-")[0] : "";
  for (const key of [language, prefix, fallbackLocale, fallbackPrefix]) {
    if (key && typeof pair[key] === "string" && pair[key]) return pair[key];
  }
  return "";
}
function modelDescription(provider, model, locale = "zh") {
  const metadata = typeof model?.description === "string" ? model.description : "";
  const id2 = typeof model?.id === "string" ? model.id.toLowerCase() : "";
  if (!id2) return metadata;
  const pair = familyCopy(provider, id2) || tiers.find((rule) => rule.re.test(id2))?.text;
  return localized(pair, locale) || metadata;
}
var MODEL_DESCRIPTION_PROVENANCE, compile, families, tiers, fallbackLocale;
var init_model_descriptions = __esm({
  "assist/client/model-descriptions.js"() {
    init_model_descriptions_data();
    MODEL_DESCRIPTION_PROVENANCE = Object.freeze({
      package: "dsh-claude-style",
      version: "0.16.3",
      commit: "33fc20b63d4cbd31cfec98d7952e3c53ec11c832",
      sourceUrl: "https://raw.githubusercontent.com/Nwflower/dsh-claude-style/33fc20b63d4cbd31cfec98d7952e3c53ec11c832/packages/client/data/model-descriptions.json",
      license: "MIT"
    });
    compile = (rules) => rules.map((rule) => ({ re: new RegExp(rule.match, "i"), text: rule.text }));
    families = compile(model_descriptions_data_default.families);
    tiers = compile(model_descriptions_data_default.tiers);
    fallbackLocale = model_descriptions_data_default.fallback || "en";
  }
});

// assist/client/model-pin-store.js
function normalizePinIds(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = /* @__PURE__ */ new Set();
  const ids2 = [];
  for (const item of raw) {
    if (typeof item !== "string" || item === "") continue;
    if (seen.has(item)) continue;
    seen.add(item);
    ids2.push(item);
  }
  return ids2;
}
function pinIdsForSections(raw, sections) {
  const known = new Set((sections ?? []).map((g) => g?.id).filter((id2) => typeof id2 === "string"));
  return normalizePinIds(raw).filter((id2) => known.has(id2));
}
function togglePinnedProvider(id2, raw) {
  const ids2 = normalizePinIds(raw);
  return ids2.includes(id2) ? ids2.filter((x) => x !== id2) : ids2.concat(id2);
}
function readPinnedProviders(storage) {
  try {
    return normalizePinIds(JSON.parse(storage?.getItem?.(PIN_KEY) ?? "[]"));
  } catch {
    return [];
  }
}
function writePinnedProviders(ids2, storage) {
  try {
    storage?.setItem?.(PIN_KEY, JSON.stringify(normalizePinIds(ids2)));
  } catch {
  }
  return ids2;
}
var PIN_KEY;
var init_model_pin_store = __esm({
  "assist/client/model-pin-store.js"() {
    PIN_KEY = "local-prompt-assist:model-pinned-providers";
  }
});

// assist/client/model-picker-style.js
var pickerCss;
var init_model_picker_style = __esm({
  "assist/client/model-picker-style.js"() {
    pickerCss = `
.lpa-model-root{display:inline-flex;min-width:0}
.lpa-model-trigger{display:inline-flex;align-items:center;gap:5px;height:28px;max-width:min(320px,52cqw);min-width:0;padding:0 7px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;cursor:pointer}
.lpa-model-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2,rgba(127,127,127,.18)))}
.lpa-model-trigger:disabled{opacity:.5;cursor:default}
.lpa-model-trigger-label{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1}
.lpa-model-trigger-icon{display:none}
.lpa-model-trigger-effort{display:block;font-size:13px;line-height:1;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.lpa-model-chevron{flex:none;display:block;width:12px;height:12px;color:var(--dsw-alias-label-caption,var(--lpa-menu-fore,#a6a094))}
.lpa-model-menu{position:fixed;z-index:1200;display:flex;flex-direction:column;box-sizing:border-box;width:344px;max-width:calc(100vw - 16px);max-height:min(660px,calc(100vh - 16px));padding:6px;border:1px solid var(--dsw-alias-border-l1,#80808066);border-radius:12px;background-color:var(--dsw-alias-bg-layer-1,var(--lpa-menu-base,transparent));color:var(--dsw-alias-label-primary);box-shadow:0 8px 24px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:start;overflow:hidden}
.lpa-model-scroll{min-height:40px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scroll-padding-block:26px;flex:1 1 auto;contain:layout paint;will-change:scroll-position}
.lpa-model-group{padding:0 0 4px}
.lpa-model-group-name{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:6px;min-height:0;box-sizing:border-box;margin:2px 7px;padding:0;background-color:var(--dsw-alias-bg-layer-1,var(--lpa-menu-base,transparent));font-size:11px;letter-spacing:.02em;font-weight:400;line-height:14px;color:var(--dsw-alias-label-caption,var(--lpa-menu-fore,#a6a094))}
.lpa-model-group-name>span{flex:none;min-width:0;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lpa-model-group-name::after{content:"";height:0;flex:1;border-top:.5px solid var(--dsw-alias-border-l2,#dedcd2);background:none}
.lpa-model-option{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;box-sizing:border-box;padding:5px 7px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:inherit;cursor:pointer}
.lpa-model-option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2,rgba(127,127,127,.18)))}
.lpa-model-option:focus-visible,.lpa-model-trigger:focus-visible,.lpa-model-retry:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.lpa-model-option:disabled{opacity:.45;cursor:default}
.lpa-model-copy{display:flex;flex:1;flex-direction:column;gap:1px;min-width:0}
.lpa-model-name{font-size:13px;font-weight:500;line-height:16px;overflow-wrap:anywhere;color:var(--dsw-alias-label-primary,var(--lpa-menu-fore,#141413))}
.lpa-model-desc{font-size:11px;font-weight:400;line-height:14px;white-space:normal;overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary,var(--lpa-menu-fore,#8f8d84))}
.lpa-model-check{flex:none;align-self:flex-start;margin-top:2px;font-size:13px;color:var(--dsw-alias-brand-primary)}
.lpa-model-status,.lpa-model-error{margin:0;padding:6px 8px;font-size:11px;line-height:16px;overflow-wrap:anywhere}
.lpa-model-status{color:var(--dsw-alias-label-secondary)}
.lpa-model-error{color:var(--dsw-alias-state-error-primary)}
.lpa-model-failures{flex:0 1 auto;max-height:100px;overflow:auto;border-top:1px solid var(--dsw-alias-border-l1,#80808066)}
.lpa-model-retry{margin:2px 8px 6px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l1,#80808066);border-radius:5px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}
.lpa-effort-frame{flex:none;padding:10px 0;border-top:1px solid var(--dsw-alias-border-l1,#80808066)}
.lpa-model-more{display:grid;gap:1px;padding:2px 0 6px}
.lpa-model-other-provider{padding:2px 0 4px}
.lpa-model-other-provider--divided{border-top:1px solid var(--dsw-alias-border-l1,#80808066);margin-top:2px;padding-top:4px}
.lpa-model-provider-row--open{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2,rgba(127,127,127,.18)))}
.lpa-model-flyout{position:fixed;z-index:1201;transform:translateZ(0);display:flex;flex-direction:column;box-sizing:border-box;width:300px;max-width:calc(100vw - 16px);max-height:min(520px,calc(100vh - 16px));padding:6px;border:1px solid var(--dsw-alias-border-l1,#80808066);border-radius:12px;background-color:var(--dsw-alias-bg-layer-1,var(--lpa-menu-base,transparent));color:var(--dsw-alias-label-primary);box-shadow:0 8px 24px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:start;overflow:hidden}
.lpa-model-flyout-head{display:flex;align-items:center;gap:6px;margin:2px 4px 4px;font-size:11px;letter-spacing:.02em;line-height:14px;color:var(--dsw-alias-label-caption,var(--lpa-menu-fore,#a6a094))}
.lpa-model-flyout-head>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lpa-model-flyout-scroll{min-height:0;overflow-y:auto;overscroll-behavior:contain;flex:1 1 auto;contain:layout paint;will-change:scroll-position}
.lpa-model-other-label{display:flex;align-items:center;gap:6px;margin:2px 11px 0;font-size:11px;line-height:14px;color:var(--dsw-alias-label-caption,var(--lpa-menu-fore,#a6a094))}
.lpa-model-other-label>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lpa-model-provider-row{display:flex;align-items:center;gap:8px;width:100%;min-height:30px;box-sizing:border-box;padding:4px 7px;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;text-align:inherit;cursor:pointer}
.lpa-model-provider-row:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2,rgba(127,127,127,.18)))}
.lpa-model-provider-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.lpa-model-provider-row:disabled{opacity:.45;cursor:default}
.lpa-model-provider-copy{display:flex;align-items:center;gap:6px;flex:1;min-width:0}
.lpa-model-provider-name{font-size:13px;font-weight:500;letter-spacing:0;line-height:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,var(--lpa-menu-fore,#141413))}
.lpa-model-provider-meta{flex:none;display:inline-flex;align-items:center;gap:7px}
.lpa-model-provider-count{font-size:10px;line-height:14px;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.lpa-model-provider-chevron{flex:none;font-size:13px;line-height:1;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary))}
.lpa-model-provider-row--current .lpa-model-provider-name,.lpa-model-provider-row--current .lpa-model-provider-chevron{color:var(--dsw-alias-brand-primary)}
.lpa-model-pin{flex:none;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;height:auto;padding:0;border:0;border-radius:0;background:transparent;color:inherit;font-size:11px;font-weight:400;letter-spacing:0;line-height:14px;cursor:pointer}
.lpa-model-pin:hover:not(:disabled){color:var(--dsw-alias-label-primary,var(--lpa-menu-fore,#141413))}
.lpa-model-pin:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.lpa-model-pin[aria-pressed="true"]{color:var(--dsw-alias-brand-primary)}
/* ZCode style (zai-org/ZCode, Apache-2.0): provider navigation replaces pinned groups;
   the other-models flyout stays Claude Style only. */
.lpa-model-menu[data-style='zcode']{width:320px}
.lpa-model-menu[data-style='zcode'] .lpa-model-desc{display:none}
.lpa-model-menu[data-style='zcode'] .lpa-model-option{min-height:32px;width:calc(100% - 4px);margin:0 2px;padding:0 8px;border-radius:8px}
.lpa-model-menu[data-style='zcode'] .lpa-model-option:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent)}
.lpa-model-menu[data-style='zcode'] .lpa-model-option--current{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}
/* The shared effort frame draws its own top border for Claude Style; ZCode replaces it with the divider below, so keeping both would stack two lines. */
.lpa-model-menu[data-style='zcode'] .lpa-effort-frame{border-top:0}
/* A silent effort submit keeps rows disabled but must not dim them: the whole list flashing light reads as a popup flicker. */
.lpa-model-menu[data-silent] .lpa-model-option:disabled,
.lpa-model-menu[data-silent] .lpa-model-provider-row:disabled,
.lpa-model-menu[data-silent] .lpa-model-pin:disabled,
.lpa-model-menu[data-silent] .lpa-zt-row:disabled{opacity:1}
/* ZCode separates menu regions with a hairline of 10% foreground (--color-border); full-bleed like its DropdownMenuSeparator. */
.lpa-model-menu[data-style='zcode'] .lpa-zt-divider{flex:none;height:1px;margin:4px -6px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent)}
.lpa-zt-row{display:flex;align-items:center;gap:8px;box-sizing:border-box;width:calc(100% - 4px);min-height:32px;margin:0 2px 2px;padding:0 8px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer;text-align:start}
.lpa-zt-row:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent)}
.lpa-zt-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.lpa-zt-row:disabled{opacity:.5;cursor:default}
.lpa-zt-provider-name{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:start}
.lpa-zt-provider-count{flex:none;font-size:11px;line-height:14px;color:var(--dsw-alias-label-caption,var(--lpa-menu-fore,#a6a094))}
.lpa-zt-provider-chevron,.lpa-zt-back-chevron{flex:none;font-size:12px;line-height:1;color:var(--dsw-alias-label-caption,var(--lpa-menu-fore,#a6a094))}
.lpa-zt-provider-option--current .lpa-zt-provider-name{color:var(--dsw-alias-brand-primary)}
`;
  }
});

// assist/client/claude-effort-style.js
var claudeEffortCss;
var init_claude_effort_style = __esm({
  "assist/client/claude-effort-style.js"() {
    claudeEffortCss = `
.lpa-effort.lpa-ce {
  --lpa-ce-duration-feedback: 120ms;
  --lpa-ce-duration-surface: 150ms;
  --lpa-ce-duration-swap: 150ms;
  --lpa-ce-duration-move: 200ms;
  --lpa-ce-duration-fade: 300ms;
  --lpa-ce-period-flash: 1450ms;
  /* Not zero (the original tokens.json note): a transition whose duration and
     delay are both zero never starts and fires no transitionend, so anything
     listening for its end would wait forever. */
  --lpa-ce-duration-reduced: 0.01ms;
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
/* The Reduced-animation choice follows the original skin's own net
   (theme/chrome.css, D40): durations collapse to --lpa-ce-duration-reduced \u2014
   0.01ms, not zero, so a transition whose end anything waits for still fires \u2014
   while the flash shorthand's !important infinite keeps outranking the plain
   iteration count, so the apex twinkle keeps breathing at the compressed
   period instead of freezing. The matrix's scattered delays are cleared, so
   nothing trickles in after the choice and every part lands instantly. The
   first port's blanket animation: none also stopped that twinkle, which read
   as a plain colouring of the top rung under the system's Reduced Motion. */
@media (prefers-reduced-motion: reduce) {
  .lpa-effort.lpa-ce .lpa-ce-value,
  .lpa-effort.lpa-ce .lpa-ce-value-ghost,
  .lpa-effort.lpa-ce .lpa-ce-fill,
  .lpa-effort.lpa-ce .lpa-ce-ticks,
  .lpa-effort.lpa-ce .lpa-ce-knob,
  .lpa-effort.lpa-ce[data-dragging] .lpa-ce-knob,
  .lpa-effort.lpa-ce .lpa-ce-matrix-cell,
  .lpa-effort.lpa-ce .lpa-ce-matrix-sq {
    animation-duration: var(--lpa-ce-duration-reduced) !important;
    animation-iteration-count: 1;
    transition-duration: var(--lpa-ce-duration-reduced) !important;
  }
  .lpa-effort.lpa-ce .lpa-ce-matrix-cell { animation-delay: 0s !important; }
  .lpa-effort.lpa-ce .lpa-ce-matrix-sq { animation-delay: 0s !important; }
}

/* Deliberate departure from the original net (see the SLIDER-PROVENANCE
   adaptation): the original reduced choice compresses the apex flash to 0.01ms,
   which a display can only sample as a high-frequency strobe, and it repaints
   every matrix square on every frame, so a long menu stuttered while scrolling
   at the top rung. These declarations stay outside the mapped original rules so
   those bytes remain untouched. */
.lpa-effort.lpa-ce {
  --lpa-ce-period-flash-reduced: 2400ms;
}
@keyframes lpa-ce-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: .55; }
}
@media (prefers-reduced-motion: reduce) {
  .lpa-effort.lpa-ce .lpa-ce-matrix-sq {
    animation: none !important;
  }
  .lpa-effort.lpa-ce .lpa-ce-matrix {
    animation: lpa-ce-breathe var(--lpa-ce-period-flash-reduced, 2400ms) var(--lpa-ce-ease-in-out) infinite !important;
  }
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
  }
});

// assist/client/claude-effort-visual.js
function magneticRatio(rawRatio, levelCount) {
  const ratio = Number.isFinite(rawRatio) ? Math.max(0, Math.min(1, rawRatio)) : 0;
  if (levelCount < 2) return ratio;
  const segments = levelCount - 1;
  const segment = Math.floor(ratio * segments);
  if (segment >= segments) return ratio;
  const t = ratio * segments - segment;
  return (segment + t - 0.8 * Math.sin(2 * Math.PI * t) / (2 * Math.PI)) / segments;
}
function matrixGeometry(width, devicePixelRatio) {
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
    cols,
    rows,
    sq: block / dpr,
    gap: gap / dpr,
    padTop: Math.floor(restY / 2) / dpr,
    padBottom: (restY - Math.floor(restY / 2)) / dpr,
    padLeft: Math.floor(restX / 2) / dpr,
    padRight: (restX - Math.floor(restX / 2)) / dpr
  };
}
function cellUnit(r, c, seed) {
  let hash = Math.imul(r + 1, 2654435761) ^ Math.imul(c + 1, 2246822507) ^ Math.imul(seed + 1, 668265263);
  hash = Math.imul(hash ^ hash >>> 15, 625341585);
  hash ^= hash >>> 13;
  return (hash >>> 0) / 4294967296;
}
function cellFade(fx) {
  if (fx <= 0.05) return 0;
  if (fx >= 0.75) return 1;
  const t = (fx - 0.05) / 0.7;
  return t * t * (3 - 2 * t);
}
function matrixParticle(row, column, columnCount) {
  const fx = columnCount > 1 ? column / (columnCount - 1) : 1;
  return {
    tone: Math.floor(cellUnit(row, column, 1) * 8) % 8,
    opacity: cellFade(fx).toFixed(3),
    entranceDelay: ((1 - fx) * FLASH_SECONDS * 0.31 + cellUnit(row, column, 4) * FLASH_SECONDS * 0.055).toFixed(3) + "s",
    delay: (cellUnit(row, column, 2) * FLASH_SECONDS * 0.95 + FLASH_SECONDS * 0.21).toFixed(3) + "s",
    duration: (FLASH_SECONDS * (0.92 + cellUnit(row, column, 3) * 0.16)).toFixed(3) + "s"
  };
}
function useTrackBox(track) {
  const [box, setBox] = import_react14.default.useState({ width: 0, dpr: 1 });
  useLayout(() => {
    const node = track.current;
    if (!node) return;
    const view = node.ownerDocument.defaultView;
    const measure = () => {
      const width = node.clientWidth;
      const dpr = view?.devicePixelRatio > 0 ? view.devicePixelRatio : 1;
      setBox((previous) => previous.width === width && previous.dpr === dpr ? previous : { width, dpr });
    };
    measure();
    const Resize = view?.ResizeObserver ?? globalThis.ResizeObserver;
    const observer = typeof Resize === "function" ? new Resize(measure) : null;
    observer?.observe(node);
    view?.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      view?.removeEventListener("resize", measure);
    };
  }, [track]);
  return box;
}
function ClaudeEffortVisual({
  rows = [],
  index = 0,
  position = null,
  dragging = false,
  disabled = false,
  unknown = false,
  label = "",
  t,
  children
}) {
  const track = import_react14.default.useRef(null), knob = import_react14.default.useRef(null), fill = import_react14.default.useRef(null), value = import_react14.default.useRef(null);
  const box = useTrackBox(track);
  const count = rows.length;
  const at = Math.max(0, Math.min(Math.max(0, count - 1), Number.isInteger(index) ? index : 0));
  const ratio = position === null ? count < 2 ? 1 : at / (count - 1) : magneticRatio(position, count);
  const pixels = Math.round(ratio * Math.max(0, box.width - 16));
  const geometry = import_react14.default.useMemo(() => matrixGeometry(box.width, box.dpr), [box.width, box.dpr]);
  const wantsApex = count > 1 && at === count - 1 && !unknown;
  const [matrixBuilt, setMatrixBuilt] = import_react14.default.useState(false);
  const layout = wantsApex || matrixBuilt ? geometry : null;
  const apex = wantsApex && layout !== null;
  const signature = Math.round(box.width * box.dpr) + "@" + box.dpr;
  useLayout(() => {
    if (apex) setMatrixBuilt(true);
  }, [apex]);
  useLayout(() => {
    if (!knob.current || !fill.current) return;
    knob.current.style.transition = "none";
    fill.current.style.transition = "none";
    void knob.current.offsetWidth;
    knob.current.style.transition = "";
    fill.current.style.transition = "";
  }, [box.width]);
  const [swap, setSwap] = import_react14.default.useState({ text: label, previous: "", serial: 0, left: 0 });
  useLayout(() => {
    if (swap.text === label) return;
    const left = value.current?.offsetLeft ?? 0;
    setSwap((previous) => ({ text: label, previous: previous.text, serial: previous.serial + 1, left }));
  }, [label, swap.text]);
  const cells = import_react14.default.useMemo(() => {
    if (!layout) return null;
    return Array.from({ length: layout.rows * layout.cols }, (_, i) => {
      const row = Math.floor(i / layout.cols), column = i % layout.cols;
      const particle = matrixParticle(row, column, layout.cols);
      return h13(
        "div",
        {
          key: signature + ":" + i,
          className: "lpa-ce-matrix-cell",
          style: { "--lpa-ce-cell-delay": particle.entranceDelay }
        },
        h13("div", {
          className: "lpa-ce-matrix-sq",
          "data-tone": particle.tone,
          style: {
            opacity: particle.opacity,
            "--lpa-ce-particle-delay": particle.delay,
            "--lpa-ce-particle-duration": particle.duration
          }
        })
      );
    });
  }, [layout, signature]);
  const copy = (key) => typeof t === "function" ? t(key) : {
    "picker.effort": "Reasoning effort",
    "picker.faster": "Faster",
    "picker.smarter": "Smarter"
  }[key];
  return h13(
    import_react14.default.Fragment,
    null,
    h13("style", { "data-lpa-ce-style": "" }, claudeEffortCss),
    h13(
      "section",
      {
        className: "lpa-effort lpa-ce",
        "aria-label": copy("picker.effort"),
        "data-apex": apex ? "" : void 0,
        "data-empty": count === 0 ? "" : void 0,
        "data-dragging": dragging && !disabled ? "" : void 0,
        "data-disabled": disabled ? "" : void 0,
        "data-unknown": unknown ? "true" : void 0
      },
      h13(
        "div",
        { className: "lpa-ce-head" },
        h13("span", { className: "lpa-ce-label" }, copy("picker.effort")),
        h13(
          "span",
          { className: "lpa-ce-live", "aria-live": "polite", "aria-atomic": true },
          h13("span", { key: swap.serial, ref: value, className: "lpa-ce-value" }, swap.text)
        ),
        h13("span", {
          key: swap.serial,
          className: "lpa-ce-value-ghost",
          "aria-hidden": true,
          style: { left: swap.left + "px" }
        }, swap.previous)
      ),
      h13(
        "div",
        { className: "lpa-ce-ends", "aria-hidden": true },
        h13("span", { className: "lpa-ce-end" }, copy("picker.faster")),
        h13("span", { className: "lpa-ce-end" }, copy("picker.smarter"))
      ),
      h13(
        "div",
        { ref: track, className: "lpa-effort-slider lpa-ce-track" },
        h13("div", { ref: fill, className: "lpa-ce-fill", "aria-hidden": true, style: { width: (count ? pixels + 8 : 0) + "px" } }),
        h13("div", { className: "lpa-ce-ticks", "aria-hidden": true }, rows.map((row, i) => h13("span", {
          key: row.id,
          className: "lpa-ce-tick",
          style: { left: Math.round((count < 2 ? 1 : i / (count - 1)) * Math.max(0, box.width - 16) + 8) + "px" }
        }))),
        h13("div", { className: "lpa-ce-matrix", "aria-hidden": true, style: layout ? {
          gap: layout.gap + "px",
          padding: `${layout.padTop}px ${layout.padRight}px ${layout.padBottom}px ${layout.padLeft}px`,
          gridTemplateColumns: `repeat(${layout.cols}, ${layout.sq}px)`,
          gridAutoRows: layout.sq + "px"
        } : void 0 }, cells),
        h13("div", { ref: knob, className: "lpa-ce-knob", "aria-hidden": true, style: { translate: pixels + "px" } }),
        children
      )
    )
  );
}
var import_react14, h13, useLayout, FLASH_SECONDS;
var init_claude_effort_visual = __esm({
  "assist/client/claude-effort-visual.js"() {
    import_react14 = __toESM(require("react"), 1);
    init_claude_effort_style();
    init_claude_effort_style();
    h13 = import_react14.default.createElement;
    useLayout = typeof window === "undefined" ? import_react14.default.useEffect : import_react14.default.useLayoutEffect;
    FLASH_SECONDS = 1.45;
  }
});

// assist/client/zcode-effort-style.js
var zcodeEffortCss;
var init_zcode_effort_style = __esm({
  "assist/client/zcode-effort-style.js"() {
    zcodeEffortCss = `
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
.lpa-effort.lpa-zt{display:flex;flex-direction:column;gap:6px;padding:8px 7px 10px;min-width:0;user-select:none;-webkit-user-select:none}
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
  }
});

// assist/client/zcode-effort-visual.js
function isGlmHighspeedModel(name) {
  return /glm/i.test(name) && /highspeed|flashx/i.test(name);
}
function highspeedBubbles(count = 32) {
  return Array.from({ length: count }, (_, index) => ({
    ...EFFORT_BUBBLES[index % EFFORT_BUBBLES.length],
    duration: (8 + index % 5) / 10,
    delay: -index * 0.137
  }));
}
function ZcodeEffortVisual({
  rows = [],
  index = 0,
  position = null,
  dragging = false,
  disabled = false,
  unknown = false,
  highspeed = false,
  label = "",
  t,
  children
}) {
  const count = rows.length;
  const at = Math.max(0, Math.min(Math.max(0, count - 1), Number.isInteger(index) ? index : 0));
  const ratio = position === null ? count < 2 ? 1 : at / (count - 1) : Math.max(0, Math.min(1, position));
  const atMax = count > 1 && at === count - 1 && !unknown && !disabled;
  const hovered = dragging && count > 1 ? Math.round(ratio * (count - 1)) : null;
  const bubbles = highspeed ? highspeedBubbles() : EFFORT_BUBBLES;
  return h14(
    import_react15.default.Fragment,
    null,
    h14("style", { "data-lpa-zt-style": "" }, zcodeEffortCss),
    h14(
      "section",
      {
        className: "lpa-effort lpa-zt",
        "aria-label": t("picker.effort"),
        "data-max": atMax ? "" : void 0,
        "data-highspeed": highspeed ? "" : void 0,
        "data-dragging": dragging && !disabled ? "" : void 0,
        "data-disabled": disabled ? "" : void 0,
        "data-unknown": unknown ? "true" : void 0
      },
      h14(
        "div",
        { className: "lpa-zt-head" },
        h14("span", { className: "lpa-zt-label" }, t("picker.effort")),
        h14("span", { className: "lpa-zt-value", "aria-live": "polite", "aria-atomic": true }, label)
      ),
      h14(
        "div",
        { className: "lpa-zt-slider" },
        h14(
          "div",
          { className: "lpa-zt-track", "aria-hidden": true },
          h14(
            "div",
            {
              className: "lpa-zt-fill",
              "aria-hidden": true,
              style: { width: "calc(14px + (100% - 28px) * " + ratio + ")" }
            },
            atMax ? h14(
              "div",
              { className: "lpa-zt-bubbles", "aria-hidden": true },
              bubbles.map((bubble, i) => h14(
                "span",
                {
                  key: i,
                  className: "lpa-zt-bubble",
                  style: {
                    top: bubble.top + "px",
                    animationDuration: bubble.duration + "s",
                    animationDelay: bubble.delay + "s"
                  }
                },
                h14("span", { style: { width: bubble.size + "px", height: bubble.size + "px" } })
              ))
            ) : null
          )
        ),
        h14("div", { className: "lpa-zt-stops", "aria-hidden": true }, rows.map((row, i) => h14("span", {
          key: row.id,
          className: "lpa-zt-stop",
          "data-filled": count > 1 && i <= at ? "" : void 0,
          "data-hovered": i === hovered ? "" : void 0
        }))),
        h14("div", {
          className: "lpa-zt-thumb",
          "aria-hidden": true,
          style: { left: "calc((100% - 28px) * " + ratio + ")" }
        }),
        children
      )
    )
  );
}
var import_react15, h14, EFFORT_BUBBLES;
var init_zcode_effort_visual = __esm({
  "assist/client/zcode-effort-visual.js"() {
    import_react15 = __toESM(require("react"), 1);
    init_zcode_effort_style();
    h14 = import_react15.default.createElement;
    EFFORT_BUBBLES = [
      { top: 4, size: 2, duration: 2.6, delay: -0.4 },
      { top: 14, size: 3, duration: 3.2, delay: -2.1 },
      { top: 8, size: 4, duration: 2.8, delay: -1.1 },
      { top: 18, size: 2, duration: 3.6, delay: -0.8 },
      { top: 3, size: 3, duration: 3, delay: -2.5 },
      { top: 12, size: 2, duration: 3.4, delay: -1.7 },
      { top: 6, size: 3, duration: 3.1, delay: -0.9 },
      { top: 17, size: 4, duration: 2.9, delay: -2.3 },
      { top: 10, size: 2, duration: 3.5, delay: -0.2 },
      { top: 2, size: 2, duration: 2.7, delay: -1.8 },
      { top: 15, size: 3, duration: 3.3, delay: -1.2 },
      { top: 7, size: 4, duration: 3.6, delay: -3.1 }
    ];
  }
});

// assist/client/model-picker.js
function splitSections(state, rawPins) {
  const sections = sectionsOf(state), pins = pinIdsForSections(rawPins, sections);
  if (!pins.length) return { hero: sections, collapsed: [], pins };
  const pinnedSet = new Set(pins);
  return { hero: pins.map((id2) => sections.find((g) => g.id === id2)), collapsed: sections.filter((g) => !pinnedSet.has(g.id)), pins };
}
function otherModelsOf(collapsed) {
  return (collapsed ?? []).flatMap((group) => modelsOf(group).map((model) => ({ group, model })));
}
function focusOrderFor(state, pins, view) {
  if (busyState(state)) return [];
  const { hero, collapsed } = splitSections(state, pins);
  if (view === OTHER_MODELS) return collapsed.length ? otherModelsOf(collapsed).map(({ group, model }) => modelRowId(group, model)) : [];
  if (view !== null && view !== void 0) return [];
  return [...hero.flatMap((g) => modelsOf(g).map((m) => modelRowId(g, m))), ...collapsed.length ? [providerRowKey(OTHER_MODELS)] : []];
}
function orderModelProviders(groups) {
  const rank = (id2) => id2 === "deepseek-account" ? 0 : id2 === "deepseek-official" ? 1 : 2;
  return [...groups].sort((a, b) => rank(a.id) - rank(b.id));
}
function modelsOf(group) {
  return (group?.models ?? []).filter((m) => m && typeof m.id === "string").slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
function sectionsOf(state) {
  return orderModelProviders((state?.groups ?? []).filter((g) => g && typeof g.id === "string" && modelsOf(g).length));
}
function isCurrentModel(current, selection) {
  return !!current && current.provider === selection?.provider && current.model === selection?.model;
}
function currentEntry(state) {
  for (const group of sectionsOf(state)) for (const model of modelsOf(group)) if (isCurrentModel(state.current, { provider: group.id, model: model.id })) return { group, model };
  return null;
}
function zcodeProviderFor(state, viewedProviderId) {
  const groups = sectionsOf(state);
  return groups.find((group) => group.id === viewedProviderId) ?? groups.find((group) => group.id === state?.current?.provider) ?? groups[0] ?? null;
}
function busyState(state) {
  return state?.pending != null;
}
function loadingState(state) {
  return state?.status === "loading" || state?.status === "idle";
}
function effectiveEffort(entry, current) {
  return current?.reasoningEffort ?? entry?.model?.reasoning?.defaultEffort;
}
function carriedEffort(model, current) {
  const effort = current?.reasoningEffort;
  if (!effort) return void 0;
  return (model?.reasoning?.efforts ?? []).some((level) => level?.id === effort) ? effort : void 0;
}
function orderedEfforts(efforts) {
  const list = (efforts ?? []).filter((item) => item && typeof item.id === "string" && item.id);
  const ranks = list.map((item) => EFFORT_SCALE.indexOf(item.id.toLowerCase()));
  if (ranks.some((rank) => rank < 0)) return list;
  return list.map((item, index) => ({ item, rank: ranks[index] })).sort((a, b) => a.rank - b.rank).map((entry) => entry.item);
}
function effortRows(entry, current, defaultLabel, t) {
  const reasoning = entry?.model?.reasoning;
  if (!reasoning) return [];
  const active = effectiveEffort(entry, current), rows = [];
  if (reasoning.defaultEffort === void 0) rows.push({ id: "default", effort: void 0, label: defaultLabel, active: active === void 0 });
  for (const item of orderedEfforts(reasoning.efforts)) if (typeof item?.id === "string" && !rows.some((r) => r.effort === item.id)) rows.push({ id: JSON.stringify(item.id), effort: item.id, label: t && ["none", "minimal", "low", "medium", "high", "xhigh", "max"].includes(item.id) ? t("picker.level." + item.id) : item.name || item.id, active: item.id === active });
  return rows;
}
function triggerEffortLabel(state, entry, rows) {
  const shown = (value) => typeof value === "string" && value.trim() ? value : void 0;
  return shown(rows.find((r) => r.active)?.label) ?? shown(state?.retainedEffort) ?? shown(state?.current?.reasoningEffort) ?? "";
}
function effortSelection(current, rows, index) {
  if (!current || !Number.isInteger(index) || index < 0 || index >= rows.length) return null;
  return { provider: current.provider, model: current.model, ...rows[index].effort === void 0 ? {} : { reasoningEffort: rows[index].effort } };
}
function failureRows(state) {
  const rows = [];
  if (state?.error) rows.push({ id: "load", key: "picker.loadFailed", params: { message: state.error } });
  else if (state?.status === "error") rows.push({ id: "load", key: "picker.failed" });
  for (const f of state?.failures ?? []) rows.push({ id: "provider:" + f.id, key: "picker.groupFailed", params: { name: f.name || f.id, message: f.message || "" } });
  return rows;
}
function menuGeometry(trigger, size, viewport) {
  const margin = 8, gap = 6;
  return {
    left: Math.max(margin, Math.min(trigger.right - size.width, viewport.width - size.width - margin)),
    top: Math.max(margin, trigger.top - gap - size.height >= margin ? trigger.top - gap - size.height : Math.min(trigger.bottom + gap, viewport.height - size.height - margin))
  };
}
function usePlacement(trigger, panel, open) {
  const [position, setPosition] = import_react16.default.useState(null);
  const frozen = import_react16.default.useRef(null);
  import_react16.default.useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      frozen.current = null;
      return;
    }
    const place = () => {
      const anchor = trigger.current, node = panel.current;
      if (!anchor || !node) return;
      const rect = anchor.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        setPosition(null);
        return;
      }
      const live = frozen.current;
      if (!live || Math.abs(rect.top - live.top) > 0.5 || Math.abs(rect.bottom - live.bottom) > 0.5 || Math.abs(rect.right - live.right) > 0.5)
        frozen.current = { top: rect.top, bottom: rect.bottom, right: rect.right, left: rect.left, width: rect.width, height: rect.height };
      const placed = frozen.current;
      const next = menuGeometry(placed, { width: node.offsetWidth, height: node.offsetHeight }, { width: innerWidth, height: innerHeight });
      setPosition((old) => old?.left === next.left && old?.top === next.top ? old : next);
    };
    place();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    if (panel.current) observer?.observe(panel.current);
    if (trigger.current) observer?.observe(trigger.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, trigger, panel]);
  return position;
}
function useFlyout(rowRef, panelRef, open) {
  const [position, setPosition] = import_react16.default.useState(null);
  import_react16.default.useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const anchor = rowRef.current, node = panelRef.current;
      if (!anchor || !node) return;
      const rect = anchor.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        setPosition(null);
        return;
      }
      const margin = 8, gap = 6;
      const width = node.offsetWidth, height = node.offsetHeight;
      const menu = rowRef.current?.closest(".lpa-model-menu")?.getBoundingClientRect();
      const beside = rect.right + gap + width <= innerWidth - margin;
      const left = beside ? rect.right + gap : menu && menu.right + gap + width <= innerWidth - margin ? menu.right + gap : Math.max(margin, Math.min(rect.left - gap - width, menu ? menu.left - gap - width : rect.left - gap - width));
      const top = menu ? Math.max(margin, Math.min(menu.top, innerHeight - margin - 180)) : Math.max(margin, rect.top);
      const room = Math.max(180, innerHeight - top - margin), span = menu ? menu.height : room;
      const maxHeight = Math.max(180, Math.min(span, room));
      setPosition((old) => old?.left === left && old?.top === top && old?.maxHeight === maxHeight ? old : { left, top, maxHeight });
    };
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
    };
    const onScroll = (event) => {
      const target = event.target;
      if (target instanceof Node && (panelRef.current && panelRef.current.contains(target) || rowRef.current?.closest(".lpa-model-menu")?.contains(target))) return;
      schedule();
    };
    place();
    const menuEl = rowRef.current?.closest(".lpa-model-menu");
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    if (menuEl) observer?.observe(menuEl);
    if (rowRef.current) observer?.observe(rowRef.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, rowRef, panelRef]);
  return position;
}
function EffortSlider({ state, entry, disabled, t, submit, sliderRef, Visual = ClaudeEffortVisual, inputClass = "lpa-ce-input", highspeed = false }) {
  const rows = effortRows(entry, state.current, t("picker.providerDefault"), t);
  const active = rows.findIndex((r) => r.active);
  const token = JSON.stringify([state.current, rows.map((r) => r.effort)]);
  const tokenRef = import_react16.default.useRef(token);
  tokenRef.current = token;
  const gesture = import_react16.default.useRef(null), interaction = import_react16.default.useRef({ mode: null, token: null, cancelled: false });
  const [draft, setDraft] = import_react16.default.useState(null), [pointerPosition, setPointerPosition] = import_react16.default.useState(null), [landing, setLanding] = import_react16.default.useState(null);
  const alive = import_react16.default.useRef(true);
  import_react16.default.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  import_react16.default.useEffect(() => {
    if (interaction.current.mode) interaction.current.cancelled = true;
    gesture.current = null;
    setDraft(null);
    setPointerPosition(null);
  }, [token, disabled]);
  import_react16.default.useEffect(() => {
    setLanding(null);
  }, [token]);
  const clear = () => {
    gesture.current = null;
    interaction.current = { mode: null, token: null, cancelled: true };
    setDraft(null);
    setPointerPosition(null);
  };
  const commit = () => {
    const g = gesture.current, cancelled = interaction.current.cancelled;
    clear();
    if (disabled || cancelled || !g || g.token !== tokenRef.current || g.index === active) return;
    const selection = effortSelection(state.current, rows, g.index);
    if (!selection) return;
    const pending = { index: g.index, token };
    setLanding(pending);
    const settled = (result2) => {
      if (alive.current && result2?.ok !== true) setLanding((old) => old === pending ? null : old);
    };
    try {
      Promise.resolve(submit(selection, false, true)).then(settled, () => settled({ ok: false }));
    } catch {
      settled({ ok: false });
    }
  };
  const pointerRatio = (e) => {
    const node = e.currentTarget, rect = node.getBoundingClientRect(), scale = rect.width / Math.max(1, node.clientWidth);
    return Math.max(0, Math.min(1, (e.clientX - rect.left - 8 * scale) / Math.max(1, rect.width - 16 * scale)));
  };
  if (!rows.length) return null;
  const preview = landing?.token === token ? landing.index : gesture.current?.token === token ? draft : null;
  const index = preview ?? Math.max(0, active), max = Math.max(0, rows.length - 1);
  const position = interaction.current.token === token && !interaction.current.cancelled ? pointerPosition : null;
  const label = preview !== null ? rows[index]?.label : active < 0 ? t("picker.effortUnavailable") : rows[active].label;
  return h15(
    Visual,
    { rows, index, position, dragging: position !== null, disabled: disabled || rows.length < 2, unknown: active < 0 && preview === null, highspeed, label, t },
    h15("input", {
      ref: sliderRef,
      type: "range",
      className: inputClass,
      min: 0,
      max,
      step: 1,
      value: index,
      disabled: disabled || rows.length < 2,
      "aria-label": t("picker.effort"),
      "aria-valuetext": label,
      onChange: (e) => {
        const current = interaction.current;
        if (disabled || current.cancelled || current.mode && current.token !== token) return;
        const next = Number(e.currentTarget.value);
        gesture.current = { token, index: next };
        setDraft(next);
      },
      onPointerDown: (e) => {
        if (disabled || e.button !== 0) return;
        interaction.current = { mode: "pointer", token, cancelled: false };
        gesture.current = { token, index: Number(e.currentTarget.value) };
        setPointerPosition(pointerRatio(e));
        e.currentTarget.setPointerCapture?.(e.pointerId);
      },
      onPointerMove: (e) => {
        const current = interaction.current;
        if (!disabled && current.mode === "pointer" && !current.cancelled && current.token === token) setPointerPosition(pointerRatio(e));
      },
      onPointerUp: commit,
      onPointerCancel: clear,
      onBlur: clear,
      onKeyDown: (e) => {
        if (gestureKeys.includes(e.key)) {
          e.stopPropagation();
          if (!interaction.current.mode) interaction.current = { mode: "key", token, cancelled: false };
        }
        if (e.key === "Escape") clear();
      },
      onKeyUp: (e) => {
        if (gestureKeys.includes(e.key)) {
          e.stopPropagation();
          commit();
        }
      }
    })
  );
}
function ModelPicker({ locked, available, directory, load, select, t, getLocale = () => "en" }) {
  const state = import_react16.default.useSyncExternalStore(import_react16.default.useCallback((fn) => directory.subscribe(fn), [directory]), () => directory.getSnapshot(), () => directory.getSnapshot());
  const [open, setOpen] = import_react16.default.useState(false), [error, setError] = import_react16.default.useState(null), [submitting, setSubmitting] = import_react16.default.useState(false);
  const [pinsStored, setPinsStored] = import_react16.default.useState(() => readPinnedProviders(safeStorage()));
  const [otherOpen, setOtherOpen] = import_react16.default.useState(false);
  const [providerView, setProviderView] = import_react16.default.useState(null);
  const [viewedProviderId, setViewedProviderId] = import_react16.default.useState(null);
  const [silentSubmit, setSilentSubmit] = import_react16.default.useState(false);
  const [styleTick, refreshStyleTick] = import_react16.default.useState(0);
  import_react16.default.useEffect(() => onModelStyleChange(() => refreshStyleTick((v) => v + 1)), []);
  const trigger = import_react16.default.useRef(null), panel = import_react16.default.useRef(null), slider = import_react16.default.useRef(null), rowRefs = import_react16.default.useRef(/* @__PURE__ */ new Map());
  const otherRowRef = import_react16.default.useRef(null), flyoutRef = import_react16.default.useRef(null), closeTimer = import_react16.default.useRef(null);
  const lifecycle = import_react16.default.useRef({ alive: true, source: directory, epoch: 0, open: false, operation: 0, inflight: false });
  const focusRequest = import_react16.default.useRef(null), focusRecovery = import_react16.default.useRef(null), modelFocus = import_react16.default.useRef(null), id2 = import_react16.default.useId();
  const life = lifecycle.current;
  life.source = directory;
  const visible = open && available && !locked, entry = currentEntry(state), failures = failureRows(state);
  const busy = busyState(state) || submitting, position = usePlacement(trigger, panel, visible);
  import_react16.default.useEffect(() => {
    life.alive = true;
    setOpen(false);
    setProviderView(null);
    setViewedProviderId(null);
    setError(null);
    setSubmitting(false);
    life.inflight = false;
    life.epoch++;
    return () => {
      life.alive = false;
      life.epoch++;
    };
  }, [directory, life]);
  import_react16.default.useEffect(() => {
    if (!available || locked) {
      life.open = false;
      life.epoch++;
      setOpen(false);
      setProviderView(null);
      setViewedProviderId(null);
    }
  }, [available, locked, life]);
  const hide = (restore = false) => {
    life.open = false;
    life.epoch++;
    setOpen(false);
    focusRequest.current = null;
    openedByHover.current = false;
    setOtherOpen(false);
    setProviderView(null);
    setViewedProviderId(null);
    if (restore) trigger.current?.focus();
  };
  const togglePin = (id3) => {
    const { pins: pins2 } = splitSections(state, pinsStored);
    const next = togglePinnedProvider(id3, pins2);
    setPinsStored(next);
    writePinnedProviders(next, safeStorage());
  };
  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openedByHover = import_react16.default.useRef(false);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      openedByHover.current = false;
      setOtherOpen(false);
    }, 160);
  };
  import_react16.default.useEffect(() => () => cancelClose(), []);
  const { hero, collapsed, pins } = splitSections(state, pinsStored);
  const style = readModelStylePref(), zcode = style === "zcode";
  const zcSections = sectionsOf(state);
  const zcGroup = zcodeProviderFor(state, viewedProviderId);
  const zcOthers = zcGroup ? zcSections.filter((group) => group.id !== zcGroup.id) : zcSections;
  const zcSwitchable = zcOthers.length > 0;
  const zcHeaderKey = zcGroup ? "zc-provider" : null;
  const zcFocusOrder = () => providerView ? [...zcOthers.map((g) => providerRowKey(g.id)), "zc-back"] : zcGroup ? [...zcSwitchable ? [zcHeaderKey] : [], ...modelsOf(zcGroup).map((m) => modelRowId(zcGroup, m))] : [];
  const orderForFocus = () => zcode ? zcFocusOrder() : focusOrderFor(state, pins, null);
  const focusRow = (key) => {
    const node = rowRefs.current.get(key);
    if (node && !node.disabled) {
      modelFocus.current = key;
      node.focus({ preventScroll: true });
      node.scrollIntoView({ block: "nearest" });
      return true;
    }
    return false;
  };
  import_react16.default.useLayoutEffect(() => {
    if (viewedProviderId === null || zcGroup?.id === viewedProviderId) return;
    const active = document.activeElement;
    if (visible && life.open && (active === document.body || active === document.documentElement || panel.current?.contains(active))) focusRequest.current = "first";
    setViewedProviderId(null);
  }, [visible, viewedProviderId, zcGroup?.id, life]);
  import_react16.default.useLayoutEffect(() => {
    const saved = focusRecovery.current;
    if (!saved || busy) return;
    focusRecovery.current = null;
    if (!visible || saved.source !== directory || saved.epoch !== life.epoch || !life.open) return;
    if (document.activeElement !== document.body && document.activeElement !== document.documentElement) return;
    if (saved.node?.isConnected && !saved.node.disabled) saved.node.focus({ preventScroll: true });
    else if (!focusRow(modelFocus.current)) panel.current?.querySelector("button:not(:disabled),input:not(:disabled)")?.focus();
  }, [busy, visible, directory, life]);
  import_react16.default.useLayoutEffect(() => {
    if (!visible || !position || !focusRequest.current) return;
    const order = orderForFocus(), wanted = focusRequest.current === "last" ? order.at(-1) : order[0];
    if (focusRow(wanted)) {
      focusRequest.current = null;
      return;
    }
    if (!loadingState(state)) {
      panel.current?.querySelector("button:not(:disabled),input:not(:disabled)")?.focus();
      focusRequest.current = null;
    }
  }, [visible, position, state, pins, providerView, viewedProviderId, zcode]);
  import_react16.default.useLayoutEffect(() => {
    if (!collapsed.length) setOtherOpen(false);
  }, [collapsed.length]);
  import_react16.default.useLayoutEffect(() => {
    if (zcode && providerView && !zcSwitchable) setProviderView(false);
  }, [zcode, providerView, zcSwitchable]);
  import_react16.default.useEffect(() => {
    if (!visible) return;
    const outside = (e) => {
      if (!trigger.current?.contains(e.target) && !panel.current?.contains(e.target) && !flyoutRef.current?.contains(e.target)) {
        setOtherOpen(false);
        hide();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("focusin", outside);
    };
  }, [visible]);
  const reload = () => {
    const source = directory, epoch = life.epoch;
    const failed = () => {
      if (life.alive && life.source === source && life.epoch === epoch && life.open) setError("model-failed");
    };
    setError(null);
    try {
      Promise.resolve(load()).catch(failed);
    } catch {
      failed();
    }
  };
  const show = (focus = "first") => {
    if (locked || !available) return;
    life.epoch++;
    life.open = true;
    focusRequest.current = focus;
    setOpen(true);
    reload();
  };
  const submit = (selection, closeOnSuccess = true, quiet = false) => {
    if (locked || !available || life.inflight || busyState(directory.getSnapshot())) return;
    life.inflight = true;
    setSubmitting(true);
    setSilentSubmit(quiet);
    setError(null);
    const epoch = life.epoch, source = directory, operation = ++life.operation;
    focusRecovery.current = panel.current?.contains(document.activeElement) ? { source, epoch, node: document.activeElement } : null;
    return Promise.resolve().then(() => select(selection)).then((result2) => {
      if (!life.alive || life.source !== source || life.operation !== operation) return;
      if (life.open && life.epoch === epoch) {
        if (result2?.ok !== true) setError(result2?.error?.code ?? "model-failed");
        else if (closeOnSuccess) hide(true);
      }
    }, () => {
      if (life.alive && life.source === source && life.open && life.epoch === epoch) setError("model-failed");
    }).finally(() => {
      if (life.alive && life.source === source && life.operation === operation) {
        life.inflight = false;
        setSubmitting(false);
        setSilentSubmit(false);
      }
    });
  };
  const pick = (group, model) => {
    if (locked || busy || life.inflight) return;
    const current = directory.getSnapshot().current;
    if (isCurrentModel(current, { provider: group.id, model: model.id })) {
      hide(true);
      return;
    }
    const effort2 = carriedEffort(model, current);
    submit({ provider: group.id, model: model.id, ...effort2 === void 0 ? {} : { reasoningEffort: effort2 } });
  };
  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      hide(true);
      return;
    }
    if (e.key === "Tab") {
      const retry = panel.current?.querySelector(".lpa-model-retry:not(:disabled)");
      const extras = [retry, slider.current && !slider.current.disabled ? slider.current : null].filter(Boolean);
      const at = extras.indexOf(e.target);
      if (!e.shiftKey && at + 1 < extras.length) {
        e.preventDefault();
        extras[at + 1].focus();
        return;
      }
      if (e.shiftKey && at > 0) {
        e.preventDefault();
        extras[at - 1].focus();
        return;
      }
      if (e.shiftKey && at === 0 && orderForFocus().length) {
        e.preventDefault();
        if (!focusRow(modelFocus.current)) focusRow(orderForFocus()[0]);
        return;
      }
      hide(true);
      return;
    }
    if (e.target === slider.current) return;
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      const order = orderForFocus();
      if (busy || !order.length) return;
      const key = document.activeElement?.getAttribute("data-picker-row"), at = order.indexOf(key);
      const next = e.key === "Home" ? 0 : e.key === "End" ? order.length - 1 : at < 0 ? e.key === "ArrowUp" ? order.length - 1 : 0 : (at + (e.key === "ArrowDown" ? 1 : -1) + order.length) % order.length;
      focusRow(order[next]);
    }
  };
  const flyout = useFlyout(otherRowRef, flyoutRef, visible && !zcode && otherOpen && collapsed.length > 0);
  if (!available) return null;
  if (styleTick >= 0 && readModelStylePref() === "dsh") return h15(
    "div",
    { className: "lpa-model-root" },
    h15("style", null, ".lpa-model-native{font:inherit;font-size:13px;max-width:min(320px,52cqw);height:28px;color:var(--dsw-alias-label-primary,inherit);background:var(--dsw-alias-bg-layer-1,ButtonFace);border:1px solid var(--dsw-alias-border-l1,#80808066);border-radius:7px;padding:0 4px;cursor:pointer}"),
    h15(
      "select",
      {
        className: "lpa-model-native",
        disabled: busy || locked || loadingState(state),
        "aria-label": t("picker.aria"),
        value: modelRowId({ id: state.current?.provider ?? "" }, { id: state.current?.model ?? "" }),
        onChange: (e) => {
          let picked;
          try {
            picked = JSON.parse(e.target.value);
          } catch {
            return;
          }
          const group = sectionsOf(state).find((g) => g.id === picked[0]);
          const model = group ? modelsOf(group).find((m) => m.id === picked[1]) : null;
          if (group && model) pick(group, model);
        }
      },
      sectionsOf(state).length === 0 ? h15("option", { value: "" }, loadingState(state) ? t("picker.loading") : t("picker.empty")) : null,
      sectionsOf(state).map((group) => h15("optgroup", { key: group.id, label: group.name || group.id }, modelsOf(group).map((model) => h15("option", { key: modelRowId(group, model), value: modelRowId(group, model) }, model.name || model.id))))
    )
  );
  const rows = effortRows(entry, state.current, t("picker.providerDefault"), t);
  const effort = triggerEffortLabel(state, entry, rows);
  const caption = entry?.model.name || entry?.model.id || state.current?.model || (loadingState(state) ? t("picker.loading") : t("picker.fallback"));
  const otherCount = otherModelsOf(collapsed).length;
  const renderModels = (group) => modelsOf(group).map((model) => renderModel(group, model));
  const renderModel = (group, model) => {
    const key = modelRowId(group, model), checked = isCurrentModel(state.current, { provider: group.id, model: model.id });
    const description = modelDescription(group.id, model, getLocale());
    return h15(
      "button",
      {
        key,
        type: "button",
        role: "menuitemradio",
        "aria-checked": checked,
        tabIndex: -1,
        disabled: busy || locked,
        "data-picker-row": key,
        "data-provider-id": group.id,
        "data-model-id": model.id,
        ref: (node) => {
          if (node) rowRefs.current.set(key, node);
          else rowRefs.current.delete(key);
        },
        className: "lpa-model-option" + (checked ? " lpa-model-option--current" : ""),
        onFocus: () => {
          modelFocus.current = key;
        },
        onClick: () => pick(group, model)
      },
      h15("span", { className: "lpa-model-copy" }, h15("span", { className: "lpa-model-name" }, model.name || model.id), description ? h15("span", { className: "lpa-model-desc" }, description) : null),
      checked ? h15("span", { className: "lpa-model-check", "aria-hidden": true }, "\u2713") : null
    );
  };
  const groupHeader = (group) => h15(
    "div",
    { className: "lpa-model-group-name", title: group.id },
    h15("span", null, group.id === "deepseek-account" ? t("picker.account") : group.name || group.id),
    h15(
      "button",
      {
        type: "button",
        className: "lpa-model-pin",
        "data-provider-id": group.id,
        title: pins.includes(group.id) ? t("picker.unpin") : t("picker.pin"),
        "aria-pressed": pins.includes(group.id),
        "aria-label": pins.includes(group.id) ? t("picker.unpin") : t("picker.pin"),
        onClick: () => togglePin(group.id)
      },
      h15("span", { "aria-hidden": true }, pins.includes(group.id) ? t("picker.pinnedMark") : t("picker.pinMark"))
    )
  );
  const showEffort = rows.length && (!zcode || zcGroup?.id === state.current?.provider);
  const effortFrame = showEffort ? h15("div", { className: "lpa-effort-frame" }, h15(EffortSlider, {
    key: JSON.stringify([state.current?.provider, state.current?.model]),
    state,
    entry,
    disabled: busy || locked,
    t,
    submit,
    sliderRef: slider,
    Visual: zcode ? ZcodeEffortVisual : ClaudeEffortVisual,
    inputClass: zcode ? "lpa-zt-input" : "lpa-ce-input",
    highspeed: zcode && isGlmHighspeedModel(entry?.model?.name || entry?.model?.id || "")
  })) : null;
  const zcProviderName = (group) => group.id === "deepseek-account" ? t("picker.account") : group.name || group.id;
  const zcProviderRow = !zcGroup ? null : zcSwitchable ? h15(
    "button",
    {
      key: zcHeaderKey,
      type: "button",
      role: "menuitem",
      "aria-haspopup": "true",
      "aria-expanded": !!providerView,
      tabIndex: -1,
      disabled: busy || locked,
      "data-picker-row": zcHeaderKey,
      "data-provider-id": zcGroup.id,
      "aria-label": t("picker.providerSwitch", { count: zcOthers.length }),
      ref: (node) => {
        if (node) rowRefs.current.set(zcHeaderKey, node);
        else rowRefs.current.delete(zcHeaderKey);
      },
      className: "lpa-zt-row lpa-zt-provider-row",
      onFocus: () => {
        modelFocus.current = zcHeaderKey;
      },
      onClick: () => {
        focusRequest.current = "first";
        setProviderView((open2) => !open2);
      }
    },
    h15("span", { className: "lpa-zt-provider-name" }, zcProviderName(zcGroup)),
    h15("span", { className: "lpa-zt-provider-count" }, t("picker.providerCount", { count: zcOthers.length })),
    h15("span", { className: "lpa-zt-provider-chevron", "aria-hidden": true }, "\u203A")
  ) : h15(
    "div",
    { key: zcHeaderKey, role: "presentation", "data-picker-row": zcHeaderKey, "data-provider-id": zcGroup.id, className: "lpa-zt-row lpa-zt-provider-row" },
    h15("span", { className: "lpa-zt-provider-name" }, zcProviderName(zcGroup))
  );
  const zcBackRow = h15(
    "button",
    {
      key: "zc-back",
      type: "button",
      role: "menuitem",
      tabIndex: -1,
      disabled: busy || locked,
      "data-picker-row": "zc-back",
      className: "lpa-zt-row lpa-zt-back-row",
      ref: (node) => {
        if (node) rowRefs.current.set("zc-back", node);
        else rowRefs.current.delete("zc-back");
      },
      onFocus: () => {
        modelFocus.current = "zc-back";
      },
      onClick: () => {
        focusRequest.current = "first";
        setProviderView(null);
      }
    },
    h15("span", { className: "lpa-zt-back-chevron", "aria-hidden": true }, "\u2039"),
    h15("span", null, t("picker.back"))
  );
  const zcProviders = providerView ? zcOthers.map((group) => {
    const key = providerRowKey(group.id), checked = group.id === state.current?.provider;
    return h15(
      "button",
      {
        key,
        type: "button",
        role: "menuitemradio",
        "aria-checked": checked,
        tabIndex: -1,
        disabled: busy || locked,
        "data-picker-row": key,
        "data-provider-id": group.id,
        ref: (node) => {
          if (node) rowRefs.current.set(key, node);
          else rowRefs.current.delete(key);
        },
        className: "lpa-zt-row lpa-zt-provider-option" + (checked ? " lpa-zt-provider-option--current" : ""),
        onFocus: () => {
          modelFocus.current = key;
        },
        onClick: () => {
          setViewedProviderId(group.id);
          focusRequest.current = "first";
          setProviderView(null);
        }
      },
      h15("span", { className: "lpa-zt-provider-name" }, zcProviderName(group)),
      h15("span", { className: "lpa-zt-provider-count" }, t("picker.providerModels", { count: modelsOf(group).length })),
      checked ? h15("span", { className: "lpa-model-check", "aria-hidden": true }, "\u2713") : null
    );
  }) : null;
  const zcDivider = h15("div", { className: "lpa-zt-divider", "aria-hidden": true });
  const zcodeBody = h15(
    import_react16.default.Fragment,
    null,
    providerView ? null : zcProviderRow,
    providerView ? null : zcDivider,
    h15(
      "div",
      { className: "lpa-model-scroll", role: "menu", "aria-label": t("picker.models") },
      providerView ? h15(import_react16.default.Fragment, null, zcProviders, h15("div", { className: "lpa-zt-divider", "aria-hidden": true }), zcBackRow) : zcGroup ? renderModels(zcGroup) : h15("p", { className: "lpa-model-status", role: "status" }, loadingState(state) ? t("picker.loading") : t("picker.empty"))
    ),
    failures.length ? h15("div", { className: "lpa-model-failures" }, failures.map((f) => h15("p", { key: f.id, className: "lpa-model-status", role: "status" }, t(f.key, f.params)))) : null,
    showEffort ? zcDivider : null,
    effortFrame,
    error ? h15("p", { className: "lpa-model-error", role: "alert" }, t(error === "session/writer-held" ? "picker.sessionInUse" : "picker.failed")) : null,
    busy && !silentSubmit ? h15("span", { className: "lpa-model-status", role: "status" }, t("picker.saving")) : null
  );
  const otherRow = () => {
    const key = providerRowKey(OTHER_MODELS), current = collapsed.some((group) => state.current?.provider === group.id);
    return h15(
      "button",
      {
        key,
        type: "button",
        role: "menuitem",
        "aria-label": t("picker.otherRow", { count: otherCount }),
        tabIndex: -1,
        disabled: busy || locked,
        "data-picker-row": key,
        "data-provider-id": OTHER_MODELS,
        "aria-haspopup": "true",
        "aria-expanded": otherOpen && collapsed.length > 0,
        ref: (node) => {
          otherRowRef.current = node;
          if (node) rowRefs.current.set(key, node);
          else rowRefs.current.delete(key);
        },
        className: "lpa-model-provider-row" + (current ? " lpa-model-provider-row--current" : "") + (otherOpen && collapsed.length ? " lpa-model-provider-row--open" : ""),
        onFocus: () => {
          modelFocus.current = key;
        },
        onPointerEnter: () => {
          cancelClose();
          if (busy || locked) return;
          if (!otherOpen) {
            openedByHover.current = true;
            setOtherOpen(true);
          }
        },
        onPointerLeave: scheduleClose,
        onClick: () => {
          if (busy || locked) return;
          if (!otherOpen) {
            setOtherOpen(true);
            return;
          }
          if (openedByHover.current) {
            openedByHover.current = false;
            return;
          }
          setOtherOpen(false);
        },
        onKeyDown: (e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            setOtherOpen(true);
          }
        }
      },
      h15("span", { className: "lpa-model-provider-copy" }, h15("span", { className: "lpa-model-provider-name" }, t("picker.otherModels"))),
      h15(
        "span",
        { className: "lpa-model-provider-meta" },
        current ? h15("span", { className: "lpa-model-check", "aria-hidden": true }, "\u2713") : null,
        h15("span", { className: "lpa-model-provider-count" }, String(otherCount)),
        h15("span", { className: "lpa-model-provider-chevron", "aria-hidden": true }, "\u203A")
      )
    );
  };
  const flyoutPanel = otherOpen && collapsed.length ? h15(
    "div",
    {
      ref: flyoutRef,
      className: "lpa-model-flyout",
      role: "menu",
      "aria-label": t("picker.otherModels"),
      style: flyout ? { left: flyout.left, top: flyout.top, maxHeight: flyout.maxHeight } : { left: 0, top: 0, visibility: "hidden" },
      onPointerEnter: cancelClose,
      onPointerLeave: scheduleClose
    },
    h15(
      "div",
      { className: "lpa-model-flyout-head" },
      h15("span", null, t("picker.otherModels")),
      h15("span", { className: "lpa-model-provider-count" }, String(otherCount))
    ),
    h15("div", { className: "lpa-model-flyout-scroll" }, collapsed.map((group, index) => h15(
      "div",
      { key: group.id, className: "lpa-model-other-provider" + (index ? " lpa-model-other-provider--divided" : "") },
      h15(
        "div",
        { className: "lpa-model-other-label" },
        h15("span", null, group.id === "deepseek-account" ? t("picker.account") : group.name || group.id),
        h15(
          "button",
          {
            type: "button",
            className: "lpa-model-pin",
            "data-provider-id": group.id,
            title: t("picker.pin"),
            "aria-pressed": false,
            "aria-label": t("picker.pin"),
            disabled: busy || locked,
            onClick: () => togglePin(group.id)
          },
          h15("span", { "aria-hidden": true }, t("picker.pinMark"))
        )
      ),
      modelsOf(group).map((model) => renderModel(group, model))
    )))
  ) : null;
  const menu = visible ? h15(
    "div",
    {
      ref: panel,
      id: id2 + "-panel",
      className: "lpa-model-menu",
      role: "dialog",
      "aria-label": t("picker.aria"),
      "aria-busy": busy || loadingState(state),
      "data-style": style,
      "data-silent": silentSubmit ? "" : void 0,
      style: { ...position ?? { left: 0, top: 0, visibility: "hidden" }, ...menuSurfaceVars() },
      onKeyDown
    },
    zcode ? zcodeBody : h15(
      import_react16.default.Fragment,
      null,
      h15(
        "div",
        { className: "lpa-model-scroll", role: "menu", "aria-label": t("picker.models") },
        [
          ...hero.map((group) => h15("section", { key: group.id, className: "lpa-model-group", role: "group", "aria-label": group.name || group.id }, groupHeader(group), renderModels(group))),
          collapsed.length ? h15("div", { key: "more", className: "lpa-model-more" }, otherRow()) : null
        ],
        !hero.length && !collapsed.length ? h15("p", { className: "lpa-model-status", role: "status" }, loadingState(state) ? t("picker.loading") : t("picker.empty")) : null
      ),
      failures.length ? h15(
        "div",
        { className: "lpa-model-failures" },
        failures.map((f) => h15("p", { key: f.id, className: "lpa-model-status", role: "status" }, t(f.key, f.params))),
        h15("button", { type: "button", className: "lpa-model-retry", onClick: reload, disabled: busy || loadingState(state) }, t("picker.retry"))
      ) : null,
      effortFrame,
      error ? h15("p", { className: "lpa-model-error", role: "alert" }, t(error === "session/writer-held" ? "picker.sessionInUse" : "picker.failed")) : null,
      busy && !silentSubmit ? h15("span", { className: "lpa-model-status", role: "status" }, t("picker.saving")) : null
    )
  ) : null;
  return h15(
    import_react16.default.Fragment,
    null,
    h15("style", null, pickerCss),
    h15("div", { className: "lpa-model-root", "data-style": style }, h15(
      "button",
      {
        ref: trigger,
        type: "button",
        className: "lpa-model-trigger",
        disabled: !!locked,
        "aria-haspopup": "dialog",
        "aria-expanded": visible,
        "aria-controls": visible ? id2 + "-panel" : void 0,
        "aria-busy": busy,
        "aria-label": t("picker.ariaCurrent", { model: caption }),
        title: [caption, effort].filter(Boolean).join(" \xB7 "),
        onClick: () => visible ? hide(true) : show(),
        onKeyDown: (e) => {
          if (visible) {
            onKeyDown(e);
            return;
          }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show(e.key === "ArrowUp" ? "last" : "first");
          }
        }
      },
      h15("span", { className: "lpa-model-trigger-icon", "aria-hidden": true }, "\u25C7"),
      h15("span", { className: "lpa-model-trigger-label" }, caption),
      effort ? h15("span", { className: "lpa-model-trigger-effort" }, effort) : null,
      h15("svg", { className: "lpa-model-chevron", viewBox: "0 0 16 16", width: 12, height: 12, fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: "false" }, h15("path", { d: "M4 6l4 4 4-4" }))
    )),
    menu ? (0, import_react_dom.createPortal)(menu, document.body) : null,
    flyoutPanel && visible && !zcode ? (0, import_react_dom.createPortal)(flyoutPanel, document.body) : null
  );
}
var import_react16, import_react_dom, h15, MODEL_SLOT, MODEL_PICKER_PRIORITY, modelRowId, OTHER_MODELS, providerRowKey, EFFORT_SCALE, gestureKeys, safeStorage, menuSurfaceVars;
var init_model_picker = __esm({
  "assist/client/model-picker.js"() {
    import_react16 = __toESM(require("react"), 1);
    import_react_dom = require("react-dom");
    init_model_descriptions();
    init_model_pin_store();
    init_model_picker_style();
    init_model_style_pref();
    init_claude_effort_visual();
    init_zcode_effort_visual();
    h15 = import_react16.default.createElement;
    MODEL_SLOT = "conversation.input.model";
    MODEL_PICKER_PRIORITY = -1;
    modelRowId = (group, model) => JSON.stringify([group.id, model.id]);
    OTHER_MODELS = "other-models";
    providerRowKey = (id2) => "provider:" + id2;
    EFFORT_SCALE = ["none", "off", "minimal", "low", "medium", "high", "xhigh", "max"];
    gestureKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
    safeStorage = () => {
      try {
        return globalThis.localStorage;
      } catch {
        return void 0;
      }
    };
    menuSurfaceVars = () => {
      try {
        const paint = getComputedStyle(document.body), bg = paint.backgroundColor, fore = paint.color;
        if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return { "--lpa-menu-base": bg, "--lpa-menu-fore": fore };
      } catch {
      }
      return {};
    };
  }
});

// assist/client/index.js
var client_exports = {};
__export(client_exports, {
  installAssist: () => installAssist
});
function SettingsSurface(p) {
  return h16(import_react17.default.Fragment, null, h16("style", null, css), h16(SettingsPage, p));
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
  ctx.inject(["slots", "sessions", "modelDirectories"], (scope) => {
    const models = scope.modelDirectories, sessions = scope.sessions;
    scope.slots.inject(MODEL_SLOT, () => {
      if (readModelStylePref() === "dsh") return () => {
      };
      return scope.slots.register({
        name: MODEL_SLOT,
        priority: MODEL_PICKER_PRIORITY,
        locale: NS,
        inject: (sessionId) => {
          const directory = models.directoryFor(sessionId);
          const available = sessions.subagentAddress(sessionId) === void 0;
          return {
            available,
            directory: directory.store,
            load: () => available ? directory.load() : Promise.resolve(void 0),
            getLocale: () => ctx.locale.getLocale().active,
            select: (selection) => available ? directory.select(selection) : Promise.resolve(void 0)
          };
        }
      }, ModelPicker);
    });
  });
  ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "local-prompt-assist", order: 95, label, locale: NS, inject: () => ({ assistSend, globalSource, targetSource, connection: ctx.connection, refreshAssist: (id2) => ctx.sessions.refreshProjections(id2) }) }, SettingsSurface));
  ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: "local-prompt-assist", locale: NS, inject: () => ({ assistSend, globalSource, targetSource, connection: ctx.connection, returnToConversation: () => ctx.layout.selectPanel(null), refreshAssist: (id2) => ctx.sessions.refreshProjections(id2) }) }, SettingsSurface));
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({ name: "conversation.input.right", id: "local-prompt-enhance-action", order: 1005, label: dictionaries.en.enhance, locale: NS, inject: inject2 }, EnhanceButton));
  ctx.slots.inject("conversation.input.right", () => ctx.slots.register({ name: "conversation.input.right", id: "local-next-question-action", order: 1010, label: dictionaries.en.suggest, locale: NS, inject: inject2 }, SuggestButton));
  ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({ name: "conversation.input.overlay", id: "local-prompt-assist-results", order: 50, label, locale: NS, inject: inject2 }, AssistPanel));
}
var import_react17, h16;
var init_client = __esm({
  "assist/client/index.js"() {
    import_react17 = __toESM(require("react"), 1);
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
    init_model_picker();
    init_model_style_pref();
    h16 = import_react17.default.createElement;
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
init_model_id();
init_fast_route();
init_priority_source();
function createFast(require2) {
  let React18;
  let h17;
  const NS2 = "local-openai-fast";
  const quietCommandNames2 = Object.freeze(["openai-fast", "openai-fast-ui-health"]);
  function HiddenFastCommand2() {
    return null;
  }
  const hydratingBindings = /* @__PURE__ */ new WeakMap();
  function hasFastState(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof value.enabled === "boolean" && Array.isArray(value.providers) && value.providers.every((provider) => typeof provider === "string"));
  }
  const grantsOf = (value) => Array.isArray(value?.providers) ? value.providers.filter((provider) => typeof provider === "string" && provider).map((provider) => ({ provider })) : [];
  function derivePresentation2(fastState, selected, fallback) {
    const selection = selected ?? fallback;
    if (!selection || modelFamily(selection.model) === "other") {
      return { visible: false, enabled: false, eligible: false, reason: !selection ? "no-selection" : "unsupported-model" };
    }
    if (!hasFastState(fastState)) {
      return { visible: true, enabled: false, eligible: false, reason: "loading" };
    }
    const resolution = resolveFastRoute(selection, { grants: grantsOf(fastState) });
    return {
      visible: resolution.visible,
      enabled: resolution.eligible && fastState.enabled === true,
      eligible: resolution.eligible,
      reason: resolution.state
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
      off: "Fast \u5DF2\u5173\u95ED\u3002\u5F00\u542F\u540E\uFF0C\u672C\u4F1A\u8BDD\u53CA\u7EE7\u627F\u8BBE\u7F6E\u7684\u5DF2\u6388\u6743\u6A21\u578B\uFF08OpenAI gpt/o \u7CFB\u5217\u3001xAI Grok 4 \u53CA\u4EE5\u4E0A\uFF09\u8BF7\u6C42\u4F7F\u7528 Priority \u4F18\u5148\u5904\u7406\uFF1B\u9700\u670D\u52A1\u5546\u652F\u6301\uFF0C\u8D39\u7528\u6309\u5176\u5B9E\u9645\u6863\u4F4D\u8BA1\u6536\u3002",
      on: "Fast \u5DF2\u5F00\u542F\u3002\u672C\u4F1A\u8BDD\u53CA\u7EE7\u627F\u8BBE\u7F6E\u7684\u5DF2\u6388\u6743\u6A21\u578B\uFF08OpenAI gpt/o \u7CFB\u5217\u3001xAI Grok 4 \u53CA\u4EE5\u4E0A\uFF09\u8BF7\u6C42\u4F7F\u7528 Priority \u4F18\u5148\u5904\u7406\uFF1B\u8D39\u7528\u6309\u670D\u52A1\u5546\u5B9E\u9645\u6863\u4F4D\u8BA1\u6536\uFF0C\u70B9\u51FB\u5173\u95ED\u3002",
      saving: "\u6B63\u5728\u4FDD\u5B58 Fast \u8BBE\u7F6E\u2026",
      error: "Fast \u8BBE\u7F6E\u672A\u4FDD\u5B58\uFF0C\u8BF7\u91CD\u8BD5\u3002",
      loading: "Fast \u72B6\u6001\u5C1A\u672A\u786E\u8BA4\uFF0C\u5F00\u5173\u6682\u4E0D\u53EF\u7528\uFF1B\u8FD9\u4E0D\u4F1A\u66F4\u6539\u5DF2\u4FDD\u5B58\u7684 Fast \u8BBE\u7F6E\u3002",
      loadError: "Fast \u72B6\u6001\u540C\u6B65\u5931\u8D25\u3002\u8BF7\u5237\u65B0\u9875\u9762\uFF0C\u6216\u68C0\u67E5 Host \u4E0E Client \u63D2\u4EF6\u7248\u672C\u662F\u5426\u4E00\u81F4\u3002",
      unsupportedProvider: "\u6B64\u4F9B\u5E94\u5546\u672A\u5728 Priority \u5141\u8BB8\u540D\u5355\u4E2D\uFF0CFast \u4E0D\u4F1A\u5F00\u542F\u3002\u53EF\u5728\u201C\u63D0\u793A\u8BCD\u8F85\u52A9 \u2192 Priority \u4F9B\u5E94\u5546\u6388\u6743\u201D\u4E2D\u81EA\u52A9\u6388\u6743\uFF08\u8BE5\u4F9B\u5E94\u5546\u5FC5\u987B\u63D0\u4F9B OpenAI \u7CFB\u5217\u6216 Grok 4+ \u6A21\u578B\uFF0C\u5E76\u652F\u6301 Priority\uFF09\u3002\u4F9B\u5E94\u5546 ID",
      unverified: "\u6B64\u6A21\u578B\u8DEF\u7531\u5C1A\u672A\u9A8C\u8BC1\u662F\u5426\u652F\u6301 Priority\uFF0CFast \u6682\u4E0D\u5F00\u542F\u3002\u786E\u8BA4\u4E0A\u6E38\u652F\u6301\u540E\uFF0C\u53EF\u5728\u201C\u63D0\u793A\u8BCD\u8F85\u52A9 \u2192 Priority \u4F9B\u5E94\u5546\u6388\u6743\u201D\u4E2D\u663E\u5F0F\u6388\u6743\u3002\u4F9B\u5E94\u5546 ID",
      rejected: "\u4E0A\u6E38\u5DF2\u5FFD\u7565\u6216\u62D2\u7EDD Priority\uFF0CFast \u4E0D\u4F1A\u5728\u6B64\u8DEF\u7531\u5F00\u542F\u3002\u4F9B\u5E94\u5546 ID",
      access: "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u6267\u884C Fast \u5F00\u5173\u547D\u4EE4\u7684\u6743\u9650\u3002"
    },
    en: {
      label: "Fast",
      off: "Fast is off. Enable Priority for this session and inheriting subagents on authorized models (OpenAI gpt/o families, xAI Grok 4 and later); provider support is required and billing follows the tier the provider actually used.",
      on: "Fast is on for this session and inheriting subagents on authorized models (OpenAI gpt/o families, xAI Grok 4 and later). The provider bills the tier it actually used. Click to turn off.",
      saving: "Saving Fast preference\u2026",
      error: "Could not change Fast. Try again.",
      loading: "Fast status is not confirmed yet; the control is temporarily unavailable. Existing Host settings are unchanged.",
      loadError: "Fast state could not be loaded. Refresh or check that Host and Client plugin versions match.",
      unsupportedProvider: "This provider is not authorized for Priority, so Fast stays off. Authorize it under \u201CPrompt assist \u2192 Priority provider authorization\u201D; the provider must offer OpenAI-family or Grok 4+ models and support Priority. Provider ID",
      unverified: "Priority support for this route is not verified yet, so Fast stays off. Authorize it under \u201CPrompt assist \u2192 Priority provider authorization\u201D once the upstream is confirmed. Provider ID",
      rejected: "The upstream ignored or refused Priority, so Fast stays off on this route. Provider ID",
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
    const [selection, setSelection] = React18.useState(null);
    React18.useEffect(() => {
      let active = true;
      remote.session.modelCatalog().then((result2) => {
        if (active && result2.ok) setSelection(result2.value.default);
      }).catch(() => {
      });
      return () => {
        active = false;
      };
    }, [remote]);
    return selection;
  }
  function FastToggle(props) {
    const fastState = React18.useSyncExternalStore(props.fastSource.subscribe, props.fastSource.getSnapshot, props.fastSource.getSnapshot);
    const modelState = React18.useSyncExternalStore(props.modelSource.subscribe, props.modelSource.getSnapshot, props.modelSource.getSnapshot);
    const priorityState = props.prioritySource ? React18.useSyncExternalStore(props.prioritySource.subscribe, props.prioritySource.getSnapshot, props.prioritySource.getSnapshot) : null;
    const selected = modelState?.next ?? null;
    const defaultSelection = useDefaultSelection(props.remote);
    const sessionState = React18.useSyncExternalStore(props.sessionSource.subscribe, props.sessionSource.getSnapshot, props.sessionSource.getSnapshot);
    const unavailable = Boolean(sessionState?.subagent) || sessionState?.removed === true;
    const allowed = props.useAccess("commands/execute");
    const wireProviders = Array.isArray(fastState?.providers) ? fastState.providers : [];
    const priorityReady = priorityState?.status === "ready" && Array.isArray(priorityState.effective);
    const providers = priorityReady ? priorityState.effective.filter((provider2) => typeof provider2 === "string") : wireProviders;
    const viewState = hasFastState(fastState) ? { enabled: fastState.enabled === true, providers } : priorityReady ? { enabled: false, providers } : fastState;
    const { visible, enabled, eligible, reason } = derivePresentation2(viewState, selected, defaultSelection);
    const ready = hasFastState(fastState);
    const [loadFailed, setLoadFailed] = React18.useState(false);
    React18.useEffect(() => {
      setLoadFailed(false);
      const retry = createHydrationRetry({
        attempt: props.ensureHydrated,
        isReady: () => hasFastState(props.fastSource.getSnapshot()),
        onSettled: (value) => setLoadFailed(!value)
      });
      void retry.start();
      return () => retry.dispose();
    }, [props.hydrationKey, props.sessionId, ready]);
    const [interaction, setInteraction] = React18.useState({ enabled: null, pending: false });
    const [error, setError] = React18.useState("");
    const [notice, setNotice] = React18.useState("");
    const alive = React18.useRef(true);
    React18.useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
      };
    }, []);
    const controller = React18.useMemo(() => createToggleController2({
      initial: enabled,
      send: async (next) => {
        const result2 = await props.remote.commands.execute(
          props.sessionId,
          `/openai-fast ${next ? "on" : "off"}`,
          []
        );
        if (!result2.ok) throw new Error(result2.error.message);
        if (result2.value?.result.kind !== "success") {
          throw new Error(result2.value?.result.text ?? props.t("error"));
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
    React18.useEffect(() => controller.sync(enabled), [controller, enabled]);
    const checked = eligible && (interaction.enabled ?? enabled);
    const provider = (selected ?? defaultSelection)?.provider ?? "";
    const providerName = priorityState?.names?.[provider];
    const providerLabel = typeof providerName === "string" && providerName && providerName !== provider ? providerName + " (" + provider + ")" : provider;
    const blocked = reason === "loading" ? props.t(loadFailed ? "loadError" : "loading") : reason === "needs-verification" ? props.t("unverified") + ": " + providerLabel : reason === "grant-missing" ? props.t("unsupportedProvider") + ": " + providerLabel : reason === "rejected" ? props.t("rejected") + ": " + providerLabel : !allowed ? props.t("access") : null;
    React18.useEffect(() => {
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
    return h17(
      "span",
      { className: "local-openai-fast", title: blocked ?? props.t(checked ? "on" : "off") },
      h17("style", null, css2),
      h17("button", {
        type: "button",
        role: "switch",
        className: "local-openai-fast__button",
        "aria-label": props.t("label"),
        "aria-checked": checked,
        "aria-busy": interaction.pending || reason === "loading" && !loadFailed,
        "aria-disabled": !allowed || !eligible,
        onClick: toggle
      }, h17(
        "svg",
        { viewBox: "0 0 20 20", width: 14, height: 14, fill: "none", "aria-hidden": true },
        h17("path", {
          d: "M11.5 2 4 11h5l-.5 7L16 8h-5l.5-6Z",
          stroke: "currentColor",
          strokeWidth: 1.5,
          strokeLinejoin: "round",
          fill: checked ? "currentColor" : "none"
        })
      ), props.t("label")),
      notice ? h17("span", { role: "status", className: "local-openai-fast__notice" }, notice) : null,
      error ? h17("span", { role: "alert", className: "local-openai-fast__error" }, error) : null
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
      React18 = require2("react");
      h17 = React18.createElement;
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
/*!
 * Model descriptions and lookup adapted from dsh-claude-style 0.16.3.
 * Source commit: 33fc20b63d4cbd31cfec98d7952e3c53ec11c832
 * Provenance: third-party/claude-style/PROVENANCE.json
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
return module.exports;}});
