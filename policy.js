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
  return Boolean(selection && providers.includes(selection.provider)
    && isOpenAIModel(selection.model));
}

/** Return a fresh wire body; never mutate SDK-owned/cached input. */
export function priorityPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TypeError('OpenAI Fast: the upstream payload is not an object');
  }
  return { ...body, service_tier: 'priority' };
}
