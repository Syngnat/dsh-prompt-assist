import { ASSIST_PATH } from '../identity.js';
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
  reasoningEffort: '', fast: false, rounds: 1,
});

export function configKey(settings) {
  return JSON.stringify(['suggest', 'enhance'].map(key => {
    const config = settings?.[key] ?? DEFAULT_SETTINGS;
    return Object.keys(DEFAULT_SETTINGS).map(name => config[name]);
  }));
}

export function validateSettings(value) {
  if (!Number.isInteger(value.rounds) || value.rounds < 1 || value.rounds > 20) return 'rounds';
  if (value.enabled && !value.followSession && (!value.provider || !value.model)) return 'model';
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
  const code = String(error?.code ?? 'request_failed').toLowerCase();
  if (code.startsWith('transport-')) return 'transportError';
  if (code === 'forbidden') return 'authError';
  if (code === 'output-limit') return 'outputLimit';
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
