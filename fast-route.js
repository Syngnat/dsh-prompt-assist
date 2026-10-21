import { parseModelId } from './model-id.js';

/**
 * One resolver for one question: may this route carry a request-level Priority tier?
 *
 * The unit is the route (provider + model ID), never the provider name. A provider ID is only an
 * authorization subject when a grant names it, and a model ID is only a capability hint.
 */

/** Request-level Priority only exists on OpenAI-shaped endpoints. */
export const SUPPORTED_APIS = new Set(['openai-responses', 'openai-completions', 'openai-codex-responses']);

/**
 * ready              authorized and structurally capable: inject service_tier
 * needs-verification candidate with no evidence either way; offer an explicit grant
 * grant-missing      evidence says the upstream honors Priority, but no grant covers the route
 * rejected           evidence says the upstream ignores or refuses Priority
 * api-incompatible   the provider does not speak an OpenAI-shaped API
 * not-candidate      not a Priority family, or not a well-formed route ID
 */
export const FAST_ROUTE_STATES = Object.freeze([
  'ready', 'needs-verification', 'grant-missing', 'rejected', 'api-incompatible', 'not-candidate',
]);

/** Evidence levels a grant or a probe can establish for one route. */
export const ROUTE_EVIDENCE = Object.freeze(['verified', 'declared', 'unknown', 'rejected']);

export function routeKey(provider, model) {
  return provider + '\u0000' + model;
}

const grant = (provider, model, family) => Object.freeze({ provider, model, family });

/**
 * Normalize legacy provider lists ('openai') and route grants ({provider, model} or {provider, family})
 * into one shape. A function source is resolved on every call so live authorization is honored.
 */
export function normalizeGrants(value) {
  const list = typeof value === 'function' ? value() : value;
  if (!Array.isArray(list)) return Object.freeze([]);
  const grants = [];
  for (const item of list) {
    if (typeof item === 'string') {
      if (item) grants.push(grant(item, null, null));
      continue;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const provider = typeof item.provider === 'string' ? item.provider : '';
    if (!provider) continue;
    const model = typeof item.model === 'string' && item.model ? item.model : null;
    const family = typeof item.family === 'string' && item.family && item.family !== 'other' ? item.family : null;
    grants.push(grant(provider, model, family));
  }
  return Object.freeze(grants);
}

/** The narrowest grant that covers a route: exact model, then family, then whole provider. */
export function matchGrant(value, route) {
  if (!route) return null;
  let family = null;
  for (const candidate of normalizeGrants(value)) {
    if (candidate.provider !== route.provider) continue;
    if (candidate.model) {
      if (candidate.model === route.model) return candidate;
      continue;
    }
    if (candidate.family) {
      if (candidate.family === route.family) family = family ?? candidate;
      continue;
    }
    return candidate;
  }
  return family;
}

const result = (state, route, grant, evidence) => Object.freeze({
  state,
  visible: state === 'ready' || state === 'needs-verification' || state === 'grant-missing' || state === 'rejected',
  eligible: state === 'ready',
  route,
  grant: grant ?? null,
  evidence: evidence ?? null,
});

/**
 * Resolve one selection against one policy snapshot.
 *
 * policy = {
 *   grants:  provider list or route-grant list (see normalizeGrants),
 *   routes:  { [routeKey(provider, model)]: { priority, evidence? } },
 *   apis:    { [provider]: apiString },   // unknown providers stay candidates
 * }
 */
export function resolveFastRoute(selection, policy = {}) {
  const provider = selection && typeof selection.provider === 'string' && selection.provider ? selection.provider : '';
  const parsed = parseModelId(selection && selection.model);
  const route = provider && parsed ? Object.freeze({
    provider, model: parsed.id, family: parsed.family,
    api: policy.apis?.[provider] ?? null,
  }) : null;
  if (!route || route.family === 'other') return result('not-candidate', route);
  if (route.api && !SUPPORTED_APIS.has(route.api)) return result('api-incompatible', route);
  const evidence = policy.routes?.[routeKey(route.provider, route.model)] ?? null;
  const priority = evidence?.priority ?? 'unknown';
  if (priority === 'rejected') return result('rejected', route, matchGrant(policy.grants, route), evidence);
  const granted = matchGrant(policy.grants, route);
  if (granted) return result('ready', route, granted, evidence);
  if (priority === 'verified') return result('grant-missing', route, null, evidence);
  return result('needs-verification', route, null, evidence);
}

/** Build the policy snapshot from the shapes a caller already has. */
export function routePolicy({ grants, routes, apis } = {}) {
  return { grants: normalizeGrants(grants), routes: routes ?? null, apis: apis ?? null };
}
