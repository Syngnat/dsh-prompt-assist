/**
 * One grammar for every model ID, shared by Host policy and Client rendering.
 *
 * Proxy catalogs namespace IDs ('cpa/gpt-6.1-sol', '安和桥/grok-4.7'). A namespace is routing
 * metadata: it is preserved verbatim on the wire and never grants authorization on its own.
 * Only the final segment names the model, so every family is recognized the same way.
 */
const NAMESPACE = /^[\p{L}\p{M}\p{N}_.-]+$/u;
const UNSAFE = /[\s\\?#\u0000-\u001f\u007f]/u;

/** Families that expose a request-level Priority service tier. Adding one here is the only switch. */
export const MODEL_FAMILIES = Object.freeze([
  Object.freeze({
    id: 'openai',
    test: last => /^(?:gpt-|chatgpt-|codex(?:-|$)|o[1-9](?:-|$))/i.test(last),
  }),
  Object.freeze({
    // Grok 4 and later; forward-compatible with future major versions. grok-1/2/3 are out of scope.
    id: 'xai',
    test: last => /^grok-(?:[4-9]|[1-9]\d+)(?:[.-]|$)/i.test(last),
  }),
]);

/**
 * Parse '[namespace/]*model' into validated segments plus the family of its final segment.
 * Returns null for anything that is not a well-formed route ID (traversal, empty segments,
 * whitespace/control characters, URL fragments or backslashes).
 */
export function parseModelId(value) {
  if (typeof value !== 'string' || value.length === 0 || UNSAFE.test(value)) return null;
  const segments = value.split('/');
  if (segments.some(part => part.length === 0 || part === '.' || part === '..')) return null;
  // Namespace segments must be plain identifiers; the final segment is the model ID itself and is
  // validated by the family matcher below, exactly as it was before namespaces were supported.
  if (segments.slice(0, -1).some(part => !NAMESPACE.test(part))) return null;
  const last = segments[segments.length - 1];
  const family = MODEL_FAMILIES.find(entry => entry.test(last))?.id ?? 'other';
  return Object.freeze({ id: value, segments: Object.freeze(segments), last, family });
}

/** The family of a route ID, or 'other' when it is malformed or unrelated. */
export function modelFamily(model) {
  return parseModelId(model)?.family ?? 'other';
}

export function isOpenAIModel(model) {
  return modelFamily(model) === 'openai';
}

export function isGrokModel(model) {
  return modelFamily(model) === 'xai';
}

/** Every family whose provider exposes a request-level Priority service tier. */
export function isPriorityModel(model) {
  const family = modelFamily(model);
  return MODEL_FAMILIES.some(entry => entry.id === family);
}
