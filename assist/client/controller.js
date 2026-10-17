import { streamPreview } from './stream-preview.js';
import { configKey, referenceNames } from './api.js';
import { captureText, canSuggest, sameInput } from './editor.js';

function qaEndOf(id) {
  const match = typeof id === "string" ? /^(\d+):(\d+)$/.exec(id) : null;
  const end = match ? Number(match[2]) : 0;
  return Number.isSafeInteger(end) ? end : 0;
}

export function createAssistController(deps) {
  let current;
  let knownQA = false;
  let latestQAEnd = 0;
  let candidate = null;
  let flight = null;
  let epoch = 0;
  let disposed = false;
  const requested = new Set();
  const state = { pending: null, preview: null, error: null, trigger: null };
  const publish = patch => { Object.assign(state, patch); deps.publish({ ...state }); };
  const explain = (status, reason) => {
    const trigger = { status, reason, qaId: current?.qaId ?? null, candidate, busy: current?.busy === true };
    if (JSON.stringify(trigger) !== JSON.stringify(state.trigger)) publish({ trigger });
  };
  const cancel = () => {
    epoch += 1;
    flight?.abort();
    flight = null;
    if (state.pending) publish({ pending: null, ...(state.preview?.streaming?{preview:null}:{}) });
  };
  const configured = feature => current?.settings?.[feature]?.enabled === true
    && (current.settings[feature].followSession || Boolean(current.settings[feature].provider && current.settings[feature].model));

  function observe(next) {
    if (disposed) return;
    const previous = current;
    const changedSession = previous && previous.sessionId !== next.sessionId;
    const changedRoute = previous && previous.routeKey !== next.routeKey;
    // A missing Host route becoming known is hydration, not a user model edit.
    // Keep a queued QA, but still invalidate any in-flight result on route changes.
    const hydratedRoute = changedRoute && (previous.routeKey == null || previous.routeKey === 'null')
      && next.routeKey != null && next.routeKey !== 'null';
    const changedConfig = previous && (configKey(previous.settings) !== configKey(next.settings)
      || (changedRoute && !hydratedRoute) || previous.paused !== next.paused);
    const changedInput = previous && !sameInput(previous.input, next.input);
    const changedQA = previous && previous.qaId !== next.qaId;
    const changedBusy = previous && previous.busy !== next.busy;
    const backgroundInvalid = (changedQA || changedBusy) && state.pending !== 'enhance' && state.preview?.feature !== 'enhance';
    if (changedSession || changedConfig || changedRoute || changedInput || backgroundInvalid) cancel();
    if (changedSession || changedConfig || changedInput) candidate = null;
    if (changedSession) { knownQA = false; requested.clear(); }
    current = next;
    if (changedSession || changedConfig || changedRoute || changedInput || (changedQA && backgroundInvalid)) publish({ preview: null, error: null });
    if (next.qaId === undefined) { explain('waiting', 'qa-unavailable'); return; }
    if (!knownQA) {
      knownQA = true; latestQAEnd = qaEndOf(next.qaId); candidate = null;
      explain('skipped', 'baseline'); return;
    }
    if (changedQA) {
      const end = qaEndOf(next.qaId);
      candidate = end > latestQAEnd && configured('suggest') && canSuggest(next.input) ? next.qaId : null;
      latestQAEnd = Math.max(latestQAEnd, end);
    }
    if (candidate && !next.paused && !next.busy && configured('suggest') && canSuggest(next.input)) {
      const key = `${next.sessionId}:${candidate}`;
      if (!requested.has(key)) {
        requested.add(key);
        if (requested.size > 64) requested.delete(requested.values().next().value);
        candidate = null;
        explain('requested', 'new-qa');
        void generate('suggest');
        return;
      }
    }
    if (next.paused) explain('skipped', 'configuration-editing');
    else if (!configured('suggest')) explain('skipped', 'suggest-not-configured');
    else if (!canSuggest(next.input)) explain('skipped', 'input-ineligible');
    else if (candidate && next.busy) explain('waiting', 'busy-or-unhydrated');
    else if (changedConfig) explain('skipped', changedRoute ? 'route-changed' : 'configuration-changed');
    else if (changedInput) explain('skipped', 'input-changed');
    else if (requested.has(`${next.sessionId}:${next.qaId}`)) explain('skipped', 'already-requested');
    else explain('skipped', 'no-new-qa');
  }

  async function generate(feature, selectedFiles = []) {
    if (disposed || !current || current.paused || !configured(feature)) return false;
    if (current.input.phase === "adjudicating" || current.input.phase === "submitting") return false;
    if (feature === 'suggest' && (current.busy || !canSuggest(current.input))) return false;
    if (feature === 'enhance' && current.input.draft.trim() === '') return false;
    cancel();
    const snapshot = captureText(current.input, deps.actions());
    if (!snapshot) { publish({ error: 'stale' }); return false; }
    const revision = epoch;
    const sessionId = current.sessionId;
    const qaId = current.qaId;
    const abort = new AbortController();
    flight = abort;
    publish({ pending: feature, error: null, preview: null });
    try {
      const result = await deps.send('generate', sessionId, {
        feature, requestId: deps.requestId(), draft: snapshot.original,
        draftRev: snapshot.draftRev, qaId, files: selectedFiles,
        references: referenceNames(current.input.occurrences),
      }, abort.signal, streamPreview({isCurrent:()=>!disposed&&!abort.signal.aborted&&revision===epoch,
        publish,snapshot,sessionId,qaId,feature}));
      if (disposed || abort.signal.aborted || revision !== epoch) return false;
      if (result.draftRev !== snapshot.draftRev || result.original !== snapshot.original
        || result.feature !== feature || (feature === 'suggest' && result.qaId !== qaId) || typeof result.text !== 'string') {
        publish({ error: 'stale', preview: null }); return false;
      }
      publish({ preview: { ...result, sessionId, snapshot: { ...snapshot, structured: snapshot.structured || result.structured === true } } });
      return true;
    } catch (error) {
      if (!disposed && !abort.signal.aborted && revision === epoch) publish({ error, preview: null });
      return false;
    } finally {
      if (!disposed && revision === epoch) { flight = null; publish({ pending: null }); }
    }
  }

  return {
    observe, generate,
    mount() { disposed = false; current = undefined; knownQA = false; candidate = null; Object.assign(state, { pending: null, preview: null, error: null, trigger: null }); },
    cancel() { candidate = null; cancel(); },
    dismiss() { candidate = null; cancel(); publish({ preview: null, error: null }); },
    configurationEdited() { candidate = null; cancel(); publish({ preview: null }); },
    dispose() { disposed = true; candidate = null; cancel(); },
  };
}
