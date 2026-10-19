export const ONLINE_UPDATE_ENDPOINT = "/api/local-openai-fast.online-update";
export const ONLINE_PHASES = Object.freeze(["queued", "checking", "removing", "installing", "activating", "verifying", "recovering", "updated", "restart-required", "restored", "repair-required", "failed", "cancelled", "unknown"]);
const TERMINAL = new Set(["updated", "restart-required", "restored", "repair-required", "failed", "cancelled", "unknown"]);
const PRE_SUBMISSION_REJECTIONS = new Set(["confirmation-expired", "confirmation-required", "inventory-changed", "busy", "invalid-request", "owner-confirmation-required", "unavailable"]);
const invalid = () => Object.assign(new Error("invalid-response"), {code: "invalid-response"});
const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
const version = x => typeof x === "string" && x.length <= 80 && /^v?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/.test(x);
const code = x => typeof x === "string" && /^[a-z][a-z0-9-]{0,79}$/.test(x);
const nullableCode = x => x === null || code(x);
const id = x => typeof x === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(x);
const pinnedSpec = x => typeof x === "string" && /^github:Syngnat\/dsh-prompt-assist#[a-fA-F0-9]{40}$/.test(x);

export function normalizeOnlineOperation(x) {
  if (!object(x) || !id(x.jobId) || !version(x.fromVersion) || !version(x.targetVersion)
    || !ONLINE_PHASES.includes(x.phase) || typeof x.terminal !== "boolean" || (x.phase !== "unknown" && x.terminal !== TERMINAL.has(x.phase))
    || !(x.installedVersion === null || version(x.installedVersion)) || !nullableCode(x.error) || !nullableCode(x.detailCode)
    || typeof x.restartRequired !== "boolean" || typeof x.cancelRequested !== "boolean") throw invalid();
  if (x.phase === "updated" && (x.installedVersion !== x.targetVersion || x.restartRequired || x.error !== null)) throw invalid();
  if (x.phase === "restart-required" && !x.restartRequired) throw invalid();
  return Object.freeze(Object.fromEntries(["jobId", "fromVersion", "targetVersion", "phase", "terminal", "installedVersion", "error", "detailCode", "restartRequired", "cancelRequested"].map(key => [key, x[key]])));
}
export function normalizeOnlineStatus(x) {
  if (!object(x) || !version(x.currentVersion) || typeof x.available !== "boolean" || !nullableCode(x.reason)) throw invalid();
  // The observed installation source explains a refusal; junk degrades to null instead of failing the status.
  const source = typeof x.source === "string" && x.source.length > 0 && x.source.length <= 200
    && !/[\u0000-\u001f\u007f]/u.test(x.source) ? x.source : null;
  return Object.freeze({currentVersion: x.currentVersion, available: x.available, reason: x.reason, source,
    operation: x.operation === null ? null : normalizeOnlineOperation(x.operation)});
}
export function normalizeOnlinePreparation(x, now = Date.now()) {
  if (!object(x) || typeof x.token !== "string" || !/^[A-Za-z0-9_-]{16,512}$/.test(x.token)
    || !version(x.fromVersion) || !version(x.targetVersion) || !pinnedSpec(x.targetSpec) || !pinnedSpec(x.restoreSpec)
    || !Number.isSafeInteger(x.expiresAt) || x.expiresAt <= now || x.expiresAt > 8640000000000000) throw invalid();
  return Object.freeze(Object.fromEntries(["token", "fromVersion", "targetVersion", "targetSpec", "restoreSpec", "expiresAt"].map(key => [key, x[key]])));
}
export const ONLINE_MARKER_KEY = "local-prompt-assist.online-update.pending.v1";
const browserStorage = () => {try {return globalThis.sessionStorage;} catch {return null;}};
function readMarker(storage) {
  try {
    const x = JSON.parse(storage?.getItem(ONLINE_MARKER_KEY) ?? "null");
    if (!object(x) || !version(x.fromVersion) || !version(x.targetVersion) || !(x.jobId === null || id(x.jobId))) return null;
    return {fromVersion: x.fromVersion, targetVersion: x.targetVersion, jobId: x.jobId};
  } catch {return null;}
}
export const initialOnlineSnapshot = () => ({data: null, preparation: null, consent: false, pending: null, localError: null, uncertain: false, recordLost: false, confirmationRejected: false, recoveryAcknowledged: false, markerCleared: false});

/** Forgetting is local-only, after a successful status read and human verification. */
export const canForgetOnlineMarker = state => !!((state.uncertain || state.recordLost) && state.data && !state.pending && !state.localError
  && state.data.reason !== "busy" && (!state.data.operation || state.data.operation.terminal));

/** Only explicit prepare/confirm can POST. Disposal aborts local reads, never the Host job. */
export function createOnlineUpdateController(fetcher = globalThis.fetch, {now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, pollMs = 3000, storage = browserStorage()} = {}) {
  let state = initialOnlineSnapshot(), disposed = true, epoch = 0, timer = null, flight = null;
  let submitted = null, marker = readMarker(storage);
  if (marker) state = {...state, uncertain: true};
  const saveMarker = next => {
    marker = next;
    try {if (next) storage?.setItem(ONLINE_MARKER_KEY, JSON.stringify(next)); else storage?.removeItem(ONLINE_MARKER_KEY);} catch { /* Storage denial never blocks the Host request. */ }
  };
  const associateMarker = operation => {
    if (!marker) return true;
    if (!operation || operation.fromVersion !== marker.fromVersion || operation.targetVersion !== marker.targetVersion
      || (marker.jobId ? operation.jobId !== marker.jobId : operation.terminal)) return false;
    saveMarker(operation.terminal ? null : {fromVersion: operation.fromVersion, targetVersion: operation.targetVersion, jobId: operation.jobId});
    return true;
  };
  const listeners = new Set();
  const publish = patch => {state = {...state, ...patch}; for (const listener of listeners) listener();};
  const clearPoll = () => {if (timer !== null) clearTimer(timer); timer = null;};
  const schedule = () => {
    clearPoll();
    if (!disposed && (state.data?.reason === "busy" || (state.data?.operation && !state.data.operation.terminal)))
      timer = setTimer(() => {timer = null; void request("load");}, Math.max(3000, pollMs));
  };
  async function request(action) {
    if (disposed || state.pending) return false;
    if (action === "prepare" && (!state.data?.available || state.uncertain || (state.data.operation && !state.data.operation.terminal))) return false;
    let body, rejectedBeforeSubmission = false;
    if (action === "confirm") {
      const p = state.preparation;
      if (!p || !state.consent || state.uncertain) return false;
      if (p.expiresAt <= now()) {publish({preparation: null, consent: false, localError: "confirmation-expired"}); return false;}
      submitted = {fromVersion: p.fromVersion, targetVersion: p.targetVersion, previousJobId: state.data?.operation?.jobId};
      saveMarker({fromVersion: p.fromVersion, targetVersion: p.targetVersion, jobId: null});
      body = {action: "confirm", token: p.token, targetVersion: p.targetVersion, consent: true};
    } else if (action === "prepare") body = {action: "prepare"};
    clearPoll();
    const revision = ++epoch, abort = new AbortController();
    flight = abort;
    publish({pending: action, localError: null, confirmationRejected: false, recoveryAcknowledged: false, markerCleared: false, ...(action === "load" ? {} : {preparation: null, consent: false})});
    try {
      const response = await fetcher(ONLINE_UPDATE_ENDPOINT, {method: body ? "POST" : "GET", credentials: "same-origin", signal: abort.signal,
        ...(body ? {headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)} : {})});
      let value;
      try {value = await response.json();} catch {throw invalid();}
      if (!response.ok) {
        rejectedBeforeSubmission = response.ok === false && action === "confirm" && object(value) && Object.keys(value).length === 1 && PRE_SUBMISSION_REJECTIONS.has(value.error);
        throw Object.assign(new Error("request-failed"), {code: object(value) && code(value.error) ? value.error : "invalid-response"});
      }
      const data = action === "load" ? normalizeOnlineStatus(value) : action === "prepare" ? normalizeOnlinePreparation(value, now()) : normalizeOnlineOperation(value);
      if (disposed || revision !== epoch) return false;
      if (action === "confirm" && (data.targetVersion !== submitted.targetVersion || data.fromVersion !== submitted.fromVersion || data.jobId === submitted.previousJobId)) throw invalid();
      if (action === "load") {
        const lost = !data.operation && (state.uncertain || !!state.data?.operation || state.recordLost);
        const unresolved = (state.uncertain && submitted && (!data.operation || data.operation.jobId === submitted.previousJobId || data.operation.targetVersion !== submitted.targetVersion || data.operation.fromVersion !== submitted.fromVersion)) || !associateMarker(data.operation);
        publish({data, recordLost: lost, uncertain: lost || !!unresolved, ...(data.operation ? {preparation: null, consent: false} : {})});
      } else if (action === "prepare") publish({preparation: data});
      else {
        saveMarker(data.terminal ? null : {fromVersion: data.fromVersion, targetVersion: data.targetVersion, jobId: data.jobId});
        publish({data: {...state.data, operation: data}, uncertain: false, recordLost: false});
      }
      return true;
    } catch (error) {
      if (disposed || revision !== epoch) return false;
      if (rejectedBeforeSubmission) {saveMarker(null); submitted = null;}
      publish({localError: code(error?.code) ? error.code : "network", ...(action === "confirm" ? {
        uncertain: !rejectedBeforeSubmission, recordLost: false, confirmationRejected: rejectedBeforeSubmission,
      } : {})});
      return false;
    } finally {
      if (!disposed && revision === epoch) {flight = null; publish({pending: null}); schedule();}
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {listeners.add(listener); return () => listeners.delete(listener);},
    start() {disposed = false; return request("load");},
    load: () => request("load"),
    prepare: () => request("prepare"),
    confirm: () => request("confirm"),
    setConsent(consent) {if (!disposed && !state.pending && state.preparation) publish({consent: consent === true});},
    dismiss() {if (!disposed && !state.pending) publish({preparation: null, consent: false});},
    setRecoveryAcknowledged(value) {if (!disposed && canForgetOnlineMarker(state)) publish({recoveryAcknowledged: value === true});},
    forgetMarker() {
      if (disposed || !canForgetOnlineMarker(state) || state.recoveryAcknowledged !== true) return false;
      clearPoll(); saveMarker(null); submitted = null;
      publish({...initialOnlineSnapshot(), markerCleared: true});
      return true;
    },
    dispose() {disposed = true; epoch += 1; clearPoll(); flight?.abort(); flight = null; state = {...state, preparation: null, consent: false, recoveryAcknowledged: false, pending: null};},
  };
}
