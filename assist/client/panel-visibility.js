import { ownsResult } from './editor.js';
/** Only actionable content may keep the collapsed panel visible. */
export function shouldShowPanel({ open, result, undo, input, sessionId }) {
  const preview = ownsResult(result?.preview, sessionId);
  const actionableUndo = ownsResult(undo, sessionId) && input.draft === undo.original && input.draftRev === undo.draftRev;
  return Boolean(open || preview || result?.pending || result?.error || actionableUndo);
}
