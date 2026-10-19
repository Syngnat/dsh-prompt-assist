import { ownsResult } from './editor.js';
/** Only actionable content or an owned completion status keeps the panel visible. */
export function shouldShowPanel({ open, result, undo, input, sessionId }) {
  const preview = ownsResult(result?.preview, sessionId);
  const actionableUndo = ownsResult(undo, sessionId) && input.draft === undo.original && input.draftRev === undo.draftRev;
  return Boolean(open || preview || (ownsResult(result?.noSuggestion, sessionId) && result.noSuggestion.automatic !== true) || result?.pending || result?.error || actionableUndo);
}
