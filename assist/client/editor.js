export function captureText(input, actions) {
  const span = actions.captureInsertion();
  if (span.draftRev !== input.draftRev) return null;
  return { original: input.draft, draftRev: span.draftRev,
    structured: input.occurrences.length > 0 || Boolean(input.claim),
    span: { ...span, start: 0, end: input.draft.length } };
}
export function applyText(snapshot, text, readInput, actions) {
  if (!snapshot || snapshot.structured || typeof text !== 'string') return { ok: false, reason: 'structured' };
  if (/[\uE100-\uE11D\uFFFC]/u.test(text)) return { ok: false, reason: 'structured' };
  const input = readInput();
  const live = actions.captureInsertion();
  if (input.draft !== snapshot.original || input.draftRev !== snapshot.draftRev
    || live.draftRev !== snapshot.draftRev) return { ok: false, reason: 'stale' };
  if (input.occurrences.length || input.claim) return { ok: false, reason: 'structured' };
  if (!actions.insertText(text, snapshot.span)) return { ok: false, reason: 'stale' };
  const after = actions.captureInsertion();
  return { ok: true, undo: { original: text, draftRev: after.draftRev, structured: false,
    span: { ...after, start: 0, end: text.length }, replacement: snapshot.original } };
}
/**
 * Streaming whole-draft writer. `setDraft` lands synchronously in the composer but its React projection
 * and revision bump are asynchronous, so the "did the user take over" test cannot compare against the
 * last value we wrote: every draft we produced is remembered instead, and anything else is the user.
 */
export function createDraftWriter({ actions, readInput, intervalMs = 150, schedule = setTimeout, cancelTimer = clearTimeout }) {
  const history = new Set();
  const surface = actions ?? {};
  let snapshot = null;
  let last = null;
  let takenOver = false;
  let stopped = false;
  let pending = null;
  let timer = null;
  const live = () => (typeof readInput === 'function' ? readInput() : null) ?? {};
  const stopTimer = () => {
    if (timer === null) return;
    cancelTimer(timer);
    timer = null;
  };
  const state = () => ({ takenOver, written: typeof last === 'string' && last !== (snapshot?.original ?? null), text: last });
  const put = (text, draft) => {
    if (typeof surface.setDraft === 'function') { surface.setDraft(text); return true; }
    if (typeof surface.insertText !== 'function') return false;
    return surface.insertText(text, { ...surface.captureInsertion(), start: 0, end: draft.length }) === true;
  };
  function flush() {
    stopTimer();
    if (stopped || takenOver) { pending = null; return false; }
    const text = pending;
    pending = null;
    if (typeof text !== 'string') return false;
    const input = live();
    const draft = typeof input.draft === 'string' ? input.draft : '';
    if ((input.occurrences?.length ?? 0) > 0 || input.claim) { takenOver = true; return false; }
    if (!history.has(draft)) { takenOver = true; return false; }
    if (text === last) return true;
    if (!put(text, draft)) return false;
    history.add(text);
    last = text;
    return true;
  }
  return {
    begin(next) {
      stopTimer();
      snapshot = next ?? null;
      last = typeof snapshot?.original === 'string' ? snapshot.original : null;
      history.clear();
      if (last !== null) history.add(last);
      pending = null;
      stopped = false;
      // A structured draft cannot be replaced as a whole, so the writer never engages for one.
      takenOver = snapshot?.structured === true;
      return state();
    },
    write(text) {
      if (stopped || takenOver || typeof text !== 'string') return false;
      pending = text;
      if (timer === null) timer = schedule(flush, intervalMs);
      return true;
    },
    finish(text) {
      stopTimer();
      if (stopped || takenOver) { pending = null; return false; }
      if (typeof text === 'string') pending = text;
      return flush();
    },
    abort() { stopTimer(); pending = null; stopped = true; },
    state,
  };
}
export function undoText(undo, readInput, actions) {
  if (!undo || typeof undo.replacement !== 'string') return { ok: false, reason: 'stale' };
  // A recorded revision goes stale as soon as the Host editor's async insert lands. The draft text is the
  // real contract here, so rebuild the span from the live caret state and keep only the content check.
  const input = readInput();
  if (!input || input.draft !== undo.original) return { ok: false, reason: 'stale' };
  const live = actions.captureInsertion();
  return applyText({ ...undo, structured: false, draftRev: live.draftRev,
    span: { ...live, start: 0, end: input.draft.length } }, undo.replacement, readInput, actions);
}
export function sameInput(a, b) {
  return a.draft === b.draft && a.draftRev === b.draftRev && a.phase === b.phase
    && JSON.stringify(a.attachmentIds) === JSON.stringify(b.attachmentIds)
    && JSON.stringify(a.occurrences) === JSON.stringify(b.occurrences)
    && Boolean(a.claim) === Boolean(b.claim);
}
export function canSuggest(input) {
  return input.draft === '' && input.attachmentIds.length === 0
    && input.occurrences.length === 0 && !input.claim && input.phase === 'plain';
}
export function createViewStore() {
  let snapshot = { open: false, feature: 'enhance' };
  const listeners = new Set();
  return { getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    set(value) { snapshot = { ...snapshot, ...value }; listeners.forEach(listener => listener()); } };
}

export function ownsResult(value, sessionId) {
  return value?.sessionId === sessionId;
}
