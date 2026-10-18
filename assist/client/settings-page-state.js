import { sessionSettings } from './api.js';

export function createSettingsDraft(config) {
  return { config: sessionSettings(config), version: 0, dirty: false };
}

export function editSettingsDraft(state, config) {
  return { config: sessionSettings(config), version: state.version + 1, dirty: true };
}

/** A save acknowledges only the exact edit revision it submitted. */
export function acceptSettingsSave(state, version, config) {
  if (state.version !== version) return state;
  return { config: sessionSettings(config), version, dirty: false };
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
