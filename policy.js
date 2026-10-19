/** Explicit route allowlist: OpenAI-compatible protocol alone never opts a route in. */
export const DEFAULT_PROVIDERS = Object.freeze(['openai', 'openai-codex']);
export const SUPPORTED_APIS = new Set([
  'openai-responses', 'openai-completions', 'openai-codex-responses',
]);

/** Model-family recognition never grants provider authorization. */
export function isOpenAIModel(model) {
  return typeof model === 'string' && /^(?:gpt-|chatgpt-|codex(?:-|$)|o[1-9](?:-|$))/i.test(model);
}

/** Family matching is deliberately secondary to an explicit provider allowlist. */
export function isOpenAISelection(selection, providers = DEFAULT_PROVIDERS) {
  // The list may be a live getter, so profile-authorized providers apply without rebuilding units.
  const allowed = typeof providers === 'function' ? providers() : providers;
  return Boolean(selection && Array.isArray(allowed) && allowed.includes(selection.provider)
    && isOpenAIModel(selection.model));
}

/** One order-preserving union: package configuration first, profile authorizations after it. */
export function mergeProviders(configured, authorized) {
  const merged = [];
  for (const provider of [...(Array.isArray(configured) ? configured : []), ...(Array.isArray(authorized) ? authorized : [])]) {
    if (typeof provider === 'string' && provider && !merged.includes(provider)) merged.push(provider);
  }
  return merged;
}

/** Return a fresh wire body; never mutate SDK-owned/cached input. */
export function priorityPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('OpenAI Fast: the upstream payload is not an object');
  }
  return { ...body, service_tier: 'priority' };
}
