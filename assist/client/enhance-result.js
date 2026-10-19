/** Exact echo detection only; punctuation and internal formatting stay significant. */
export function isUnchangedEnhancement(original, text) {
  if (typeof original !== 'string' || typeof text !== 'string') return false;
  const normalize = value => value.replace(/\r\n/g, '\n').trim();
  return normalize(original) === normalize(text);
}
