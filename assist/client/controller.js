import { streamPreview } from './stream-preview.js';
import { isNoSuggestionPlaceholder } from '../suggestion-result.js';
import { configKey, referenceNames } from './api.js';
import { applyText, captureText, canSuggest, createDraftWriter, sameInput } from './editor.js';
import { isUnchangedEnhancement } from './enhance-result.js';

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
  let writer = null;
  const requested = new Set();
  const state = { pending: null, preview: null, noSuggestion: null, error: null, trigger: null, undo: null, writeback: null };
  // A dropped card must never leave a writeback record or an undoable application behind.
  const publish = patch => {
    const next = { ...patch };
    if (next.preview === null) {
      if (!('writeback' in next)) next.writeback = null;
      if (!('undo' in next)) next.undo = null;
    }
    Object.assign(state, next);
    deps.publish({ ...state });
  };
  // Actions and input reach the Host through different channels; prefer the caller's live reader.
  const readInput = () => (typeof deps.readInput === 'function' ? deps.readInput() : current?.input);
  const autoApply = () => current?.settings?.enhance?.autoApply !== false;
  const streamWrite = () => current?.settings?.enhance?.streamWrite === true;
  // Enhance landing only: suggest keeps its receipt-only contract no matter how the settings look.
  const writeBack = (receipt, snapshot, draftWriter) => {
    if (draftWriter) {
      draftWriter.finish(receipt.text);
      const settled = draftWriter.state();
      // A takeover wins over a completed write: the draft now holds the user's own edit.
      if (settled.takenOver && settled.written) return { writeback: { mode: 'taken-over' }, undo: null };
      if (settled.written) {
        const after = readInput() ?? {};
        return { writeback: { mode: 'stream' }, undo: { original: receipt.text, draftRev: after.draftRev, structured: false,
          span: { start: 0, end: receipt.text.length, draftRev: after.draftRev },
          replacement: snapshot.original, sessionId: receipt.sessionId } };
      }
    }
    if (!autoApply()) return { writeback: null, undo: null };
    const actions = deps.actions();
    if (receipt.snapshot.structured || typeof actions.insertText !== 'function'
      || typeof receipt.text !== 'string' || receipt.text.trim() === ''
      || isUnchangedEnhancement(snapshot.original, receipt.text)) return { writeback: null, undo: null };
    const outcome = applyText(snapshot, receipt.text, readInput, actions);
    return outcome.ok
      ? { writeback: { mode: 'auto' }, undo: { ...outcome.undo, sessionId: receipt.sessionId } }
      : { writeback: { mode: 'blocked', reason: outcome.reason }, undo: null };
  };
  const explain = (status, reason) => {
    const trigger = { status, reason, qaId: current?.qaId ?? null, candidate, busy: current?.busy === true };
    if (JSON.stringify(trigger) !== JSON.stringify(state.trigger)) publish({ trigger });
  };
  const cancel = () => {
    epoch += 1;
    flight?.abort();
    flight = null;
    writer?.abort();
    writer = null;
    if (state.pending || state.noSuggestion || state.writeback || state.undo) publish({ pending: null, noSuggestion: null, writeback: null, undo: null, ...(state.preview?.streaming?{preview:null}:{}) });
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
    // Our own write-back reaches the controller through the composer projection. A streamed chunk or the
    // landed draft is not a user edit, and cancelling on one would discard the record it just produced.
    const selfWritten = changedInput && (writer !== null
      || (state.undo !== null && next.input.draft === state.undo.original));
    const editedInput = changedInput && !selfWritten;
    const changedQA = previous && previous.qaId !== next.qaId;
    const changedBusy = previous && previous.busy !== next.busy;
    const backgroundInvalid = (changedQA || changedBusy) && state.pending !== 'enhance' && state.preview?.feature !== 'enhance';
    if (changedSession || changedConfig || changedRoute || editedInput || backgroundInvalid) cancel();
    if (changedSession || changedConfig || editedInput) candidate = null;
    if (changedSession) { knownQA = false; requested.clear(); }
    current = next;
    if (changedSession || changedConfig || changedRoute || editedInput || (changedQA && backgroundInvalid)) publish({ preview: null, error: null });
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
        void generate('suggest', [], true);
        return;
      }
    }
    if (next.paused) explain('skipped', 'configuration-editing');
    else if (!configured('suggest')) explain('skipped', 'suggest-not-configured');
    else if (!canSuggest(next.input)) explain('skipped', 'input-ineligible');
    else if (candidate && next.busy) explain('waiting', 'busy-or-unhydrated');
    else if (changedConfig) explain('skipped', changedRoute ? 'route-changed' : 'configuration-changed');
    else if (editedInput) explain('skipped', 'input-changed');
    else if (requested.has(`${next.sessionId}:${next.qaId}`)) explain('skipped', 'already-requested');
    else explain('skipped', 'no-new-qa');
  }

  async function generate(feature, selectedFiles = [], automatic = false) {
    if (disposed || !current || current.paused || !configured(feature)) return false;
    if (current.input.phase === "adjudicating" || current.input.phase === "submitting") return false;
    if (feature === 'suggest' && (current.busy || !canSuggest(current.input))) return false;
    if (feature === 'enhance' && current.input.draft.trim() === '') return false;
    cancel();
    const snapshot = captureText(current.input, deps.actions());
    if (!snapshot) { publish({ error: 'stale' }); return false; }
    const draftWriter = feature === 'enhance' && streamWrite() && !snapshot.structured
      ? createDraftWriter({ ...(deps.writerOptions ?? {}), actions: deps.actions(), readInput })
      : null;
    writer = draftWriter;
    if (draftWriter) draftWriter.begin(snapshot);
    const revision = epoch;
    const sessionId = current.sessionId;
    const qaId = current.qaId;
    const abort = new AbortController();
    flight = abort;
    publish({ pending: feature, error: null, preview: null });
    // The Host owns its own deadline. This ceiling only guarantees that a stuck
    // transport can never leave the composer pending forever.
    const ceiling = setTimeout(() => {
      if (revision === epoch && !abort.signal.aborted) {
        abort.abort();
        publish({ error: 'timeout', pending: null, preview: null });
      }
    }, 135000);
    // Never let the ceiling be the only reason a host process stays alive: in a browser this is
    // a number and the call is a no-op, under Node it lets tests and CLI hosts exit once idle.
    ceiling.unref?.();
    try {
      const result = await deps.send('generate', sessionId, {
        feature, requestId: deps.requestId(), draft: snapshot.original,
        draftRev: snapshot.draftRev, qaId, files: selectedFiles,
        references: referenceNames(current.input.occurrences),
      }, abort.signal, streamPreview({isCurrent:()=>!disposed&&!abort.signal.aborted&&revision===epoch,
        publish,snapshot,sessionId,qaId,feature,writer:draftWriter}));
      if (disposed || abort.signal.aborted || revision !== epoch) return false;
      if (!result || result.draftRev !== snapshot.draftRev || result.original !== snapshot.original
        || result.feature !== feature || (feature === 'suggest' && result.qaId !== qaId)) {
        publish({ error: 'stale', preview: null }); return false;
      }
      const noSuggestion = result.outcome === 'no-suggestion';
      const validText = typeof result.text === 'string' && result.text.trim() !== '';
      const validOutcome = noSuggestion
        ? feature === 'suggest' && result.text === ''
        : validText && (feature === 'suggest'
          ? (result.outcome === undefined || result.outcome === 'suggestion') && !isNoSuggestionPlaceholder(result.text)
          : result.outcome === undefined);
      if (!validOutcome) {
        publish({ error: 'requestError', preview: null, noSuggestion: null }); return false;
      }
      const receipt = { ...result, sessionId, snapshot: { ...snapshot, structured: snapshot.structured || result.structured === true } };
      // Automatic abstention stays observable in state but does not interrupt the composer.
      // Derive origin locally, never trust a cached/remote receipt to choose its visibility.
      if (noSuggestion) { publish({ noSuggestion: { ...receipt, automatic: automatic === true }, preview: null }); return true; }
      const landing = feature === 'enhance' ? writeBack(receipt, snapshot, draftWriter) : { writeback: null, undo: null };
      publish({ preview: receipt, noSuggestion: null, writeback: landing.writeback, undo: landing.undo });
      return true;
    } catch (error) {
      if (!disposed && !abort.signal.aborted && revision === epoch) publish({ error, preview: null });
      return false;
    } finally {
      clearTimeout(ceiling);
      if (draftWriter) { draftWriter.abort(); if (writer === draftWriter) writer = null; }
      if (!disposed && revision === epoch) { flight = null; publish({ pending: null }); }
    }
  }

  return {
    observe, generate,
    mount() { disposed = false; writer = null; current = undefined; knownQA = false; candidate = null; Object.assign(state, { pending: null, preview: null, noSuggestion: null, error: null, trigger: null, undo: null, writeback: null }); },
    cancel() { candidate = null; cancel(); },
    dismiss() { candidate = null; cancel(); publish({ preview: null, error: null }); },
    configurationEdited() { candidate = null; cancel(); publish({ preview: null }); },
    // Undo restored the original draft: drop the landing record so the card stops claiming a write.
    clearLanding() { publish({ preview: null, writeback: null, undo: null }); },
    // Manual landing for a card that was never written automatically; the undo record lives here only.
    applyStaged() {
      const preview = state.preview;
      if (!preview || preview.feature !== 'enhance' || preview.streaming) return { ok: false, reason: 'stale' };
      const outcome = applyText(preview.snapshot, preview.text, readInput, deps.actions());
      if (!outcome.ok) return outcome;
      publish({ preview: null, writeback: null, undo: { ...outcome.undo, sessionId: preview.sessionId } });
      return { ok: true };
    },
    dispose() { disposed = true; candidate = null; cancel(); },
  };
}
