import {ASSIST_CHANNEL, PRIORITY_ENDPOINT} from '../identity.js';

/** A profile authorization is not a session event, so the projection wire cannot carry it alone. */
const listeners = new Set();

export function notifyPriorityChanged() {
  for (const listener of [...listeners]) { try { listener(); } catch {} }
}

export function onPriorityChanged(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const ids = value => Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string'))] : [];
const displayNames = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze({});
  return Object.freeze(Object.fromEntries(Object.entries(value)
    .filter(([id, name]) => typeof id === 'string' && id.length > 0 && id.length <= 64
      && typeof name === 'string' && name.length > 0 && name.length <= 80)
    .slice(0, 64)));
};

/**
 * Read the Host-authoritative allowlist. The Host still decides actual injection; this only keeps the
 * Client's display and click permission in step with a profile authorization the projection predates.
 */
export function createPrioritySource(connection) {
  let snapshot = Object.freeze({status: 'idle', revision: null, authorized: Object.freeze([]), effective: Object.freeze([]), names: Object.freeze({})});
  const subscribers = new Set();
  let epoch = 0, disposed = false, inflight = null;
  const publish = next => { snapshot = Object.freeze(next); for (const notify of [...subscribers]) { try { notify(); } catch {} } };
  function refresh() {
    if (disposed || !connection?.rpc?.call) return Promise.resolve(snapshot);
    if (inflight) return inflight;
    const token = ++epoch;
    inflight = (async () => {
      try {
        const result = await connection.rpc.call(ASSIST_CHANNEL, PRIORITY_ENDPOINT, {action: 'snapshot'});
        if (disposed || token !== epoch) return snapshot;
        if (result?.ok !== true) { publish({...snapshot, status: 'error'}); return snapshot; }
        const value = result.value;
        publish({status: 'ready', revision: Number.isSafeInteger(value?.revision) ? value.revision : null,
          authorized: Object.freeze(ids(value?.authorized)), effective: Object.freeze(ids(value?.effective)),
          names: displayNames(value?.names)});
      } catch { if (!disposed && token === epoch) publish({...snapshot, status: 'error'}); }
      finally { if (token === epoch) inflight = null; }
      return snapshot;
    })();
    return inflight;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    refresh,
    dispose() { disposed = true; epoch += 1; inflight = null; subscribers.clear(); },
  };
}
