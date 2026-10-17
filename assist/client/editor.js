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
export function undoText(undo, readInput, actions) {
  return applyText(undo, undo?.replacement, readInput, actions);
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
