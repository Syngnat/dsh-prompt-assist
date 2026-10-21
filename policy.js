import { MODEL_FAMILIES, parseModelId, modelFamily, isOpenAIModel, isGrokModel, isPriorityModel } from './model-id.js';
import { SUPPORTED_APIS, FAST_ROUTE_STATES, ROUTE_EVIDENCE, normalizeGrants, matchGrant, resolveFastRoute, routeKey, routePolicy } from './fast-route.js';

/**
 * Public policy surface. Model-ID grammar lives in model-id.js and authorization decisions in
 * fast-route.js; this module keeps the names every Host/Client call site already imports.
 */
export {
  MODEL_FAMILIES, parseModelId, modelFamily, isOpenAIModel, isGrokModel, isPriorityModel,
  SUPPORTED_APIS, FAST_ROUTE_STATES, ROUTE_EVIDENCE, normalizeGrants, matchGrant, resolveFastRoute,
  routeKey, routePolicy,
};

/** Explicit route allowlist: OpenAI-compatible protocol alone never opts a route in. */
export const DEFAULT_PROVIDERS = Object.freeze(['openai', 'openai-codex']);

/** Family matching is deliberately secondary to an explicit authorization. */
export function isOpenAISelection(selection, providers = DEFAULT_PROVIDERS) {
  // The list may be a live getter, so profile-authorized providers apply without rebuilding units.
  return resolveFastRoute(selection, { grants: providers }).eligible;
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
