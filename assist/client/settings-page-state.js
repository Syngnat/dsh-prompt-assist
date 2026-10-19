import { sessionSettings } from './api.js';

export function createSettingsDraft(config, settingsRevision = null) {
  return { config: sessionSettings(config), version: 0, dirty: false, settingsRevision };
}
export function editSettingsDraft(state, config) {
  return { ...state, config: sessionSettings(config), version: state.version + 1, dirty: true };
}
/** Clean cards follow remote updates; dirty cards retain their original CAS baseline. */
export function syncSettingsDraft(state, config, settingsRevision) {
  return state.dirty ? state : { ...state, config: sessionSettings(config), settingsRevision };
}
/** A save acknowledges only the exact edit revision it submitted. */
export function acceptSettingsSave(state, version, config, settingsRevision = state.settingsRevision) {
  if (state.version !== version) return state;
  return { config: sessionSettings(config), version, dirty: false, settingsRevision };
}

/** A boolean write completion is not authority if a newer source publication already superseded it. */
export function matchesSettingsSave(snapshot, feature, config) {
  const { data, saved } = snapshot;
  return snapshot.connected === true && saved?.kind === 'settings' && saved.feature === feature
    && saved.settingsRevision === data?.settingsRevision && data?.configured?.[feature] === true
    && JSON.stringify(sessionSettings(data.settings[feature])) === JSON.stringify(sessionSettings(config));
}

/** Owned by one mounted page/card; ignored AbortSignals still cannot publish late results. */
export function createSettingsRequests() {
  let closed = false;
  const requests = new Set();
  return {
    begin() {
      const abort = new AbortController();
      if (closed) abort.abort();
      else requests.add(abort);
      return {
        signal: abort.signal,
        valid: () => !closed && !abort.signal.aborted,
        finish: () => requests.delete(abort),
      };
    },
    close() {
      closed = true;
      for (const request of requests) request.abort();
      requests.clear();
    },
  };
}
