import { ASSIST_PATH } from '../identity.js';
import { providerErrorKey, providerHttpStatus } from '../provider-failure.js';
export class AssistError extends Error {
  constructor(code = 'request_failed') { super(code); this.code = code; }
}

export function createAssistApi(fetcher = globalThis.fetch) {
  return async (action, sessionId, input = {}, signal) => {
    const response = await fetcher(ASSIST_PATH, {
      method: 'POST', credentials: 'same-origin', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, action, sessionId }),
    });
    let body;
    try { body = await response.json(); } catch { throw new AssistError(); }
    if (!response.ok || body?.ok !== true) throw new AssistError(body?.error?.code);
    return body.value;
  };
}

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: false, followSession: true, provider: '', model: '',
  reasoningEffort: '', fast: false, rounds: 1, autoApply: true, streamWrite: false,
});

export const SESSION_FIELDS = Object.freeze(['followSession','provider','model','reasoningEffort','fast','rounds','autoApply','streamWrite']);
/** Write-back switches are strict booleans: any other value falls back to the profile default. */
const BOOLEAN_FIELDS = Object.freeze(['autoApply','streamWrite']);
export function sessionSettings(value = {}) {
  return Object.fromEntries(SESSION_FIELDS.map(key => [key, BOOLEAN_FIELDS.includes(key)
    ? (typeof value[key] === 'boolean' ? value[key] : DEFAULT_SETTINGS[key])
    : value[key] ?? DEFAULT_SETTINGS[key]]));
}

export function configKey(settings) {
  return JSON.stringify(['suggest', 'enhance'].map(key => {
    const config = settings?.[key] ?? DEFAULT_SETTINGS;
    return Object.keys(DEFAULT_SETTINGS).map(name => config[name]);
  }));
}

export function validateSettings(value) {
  if (!Number.isInteger(value.rounds) || value.rounds < 1 || value.rounds > 20) return 'rounds';
  if (!value.followSession && (!value.provider || !value.model)) return 'model';
  return null;
}

/** The confirmed native reference codec only; never scan ordinary draft text. */
export function selectedFileOf(occurrence) {
  if (occurrence?.source !== 'reference' || occurrence.appearance !== 'file') return null;
  const ref = occurrence.ref;
  if (typeof ref !== 'string' || typeof occurrence.label !== 'string') return null;
  let path;
  if (/^@"[^"\r\n]+"$/.test(ref)) path = ref.slice(2, -1);
  else if (/^@[^\s"\r\n]+$/.test(ref)) path = ref.slice(1);
  if (!path || path.endsWith('/') || path.endsWith('\\')) return null;
  return { name: occurrence.label, path };
}

export function referenceNames(occurrences = []) {
  return occurrences.flatMap(item => typeof item?.label === 'string' ? [{ name: item.label }] : []);
}

export function errorKey(error) {
  const raw = typeof error === 'string' ? error : error?.code;
  const code = typeof raw === 'string' ? raw.toLowerCase() : 'request_failed';
  const providerKey=providerErrorKey(code);
  if(providerKey)return providerKey;
  if (code === 'stale-global-settings') return 'settings.stale';
  if (code === 'global-settings-unavailable' || code === 'global-unavailable') return 'settings.unavailable';
  if (code === 'global-save-failed') return 'global.saveFailed';
  if (code === 'fast-unsupported') return 'fastUnsupported';
  if (code === 'empty-result') return 'emptyResult';
  if (code === 'cancelled') return 'cancelled';
  if (code === 'model-failed') return 'modelFailed';
  if (code.startsWith('transport-')) return 'transportError';
  if (code === 'forbidden') return 'authError';
  if (code === 'output-limit') return 'outputLimit';
  if (code === 'timeout') return 'requestTimeout';
  if (code === 'context-unknown') return 'contextUnknown';
  if (/stale|changed|revision/.test(code)) return 'stale';
  if (/context|overflow/.test(code)) return 'contextError';
  if (/file|secret|binary|oversize/.test(code)) return 'fileError';
  if (/model|effort|provider|config/.test(code)) return 'configError';
  if (/busy/.test(code)) return 'busy';
  return 'requestError';
}

/** A stale wire view may never downgrade Host Goal/busy admission. */
export function reconcileState(host, wire, session, allowed) {
  const state = wire ? { ...host, ...wire } : host;
  const fresh = Boolean(host) && (!wire || host.qaId === wire.qaId);
  const busy = !fresh || host?.busy === true || wire?.busy === true || session?.running === true || !allowed;
  return { state, busy };
}

export function catalogInput(config, provider) {
  return config.followSession ? {} : { provider };
}

export function cleanDraftConfigs(drafts, dirtyFeatures) {
  const entries = Object.entries(drafts).filter(([key]) => dirtyFeatures.includes(key));
  return entries.length === Object.keys(drafts).length ? drafts : Object.fromEntries(entries);
}

/** A short protocol code only: never render provider prose, paths, or arbitrary objects. */
export function safeCode(error) {
  const code = typeof error === 'string' ? error : error?.code;
  return typeof code === "string" && code.length > 0 && code.length <= 64 && !/[^a-z0-9-]/u.test(code) ? code : "unknown";
}

/** Keep generic diagnostics identical in composer, settings page, and feature cards. */
export function errorText(error, t) {
  const key = errorKey(error);
  const status=providerHttpStatus(typeof error==='string'?error:error?.code);
  return t(key) + (status===null?'':` (HTTP ${status})`) + (key === "requestError" ? " " + t("safeCodeLabel") + " " + safeCode(error) : "");
}
