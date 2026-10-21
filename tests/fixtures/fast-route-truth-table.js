/**
 * Runnable truth table for Fast route authorization.
 *
 * Every row is a claim about one route: what the resolver must answer. The same data drives
 * tests/fast-route-truth-table.test.js (assertions) and scripts/fast-route-truth-table.mjs (printout),
 * so the documentation cannot drift from the implementation.
 *
 * before: what the pre-resolver policy did for the same row; it explains why the row exists.
 */
export const FAST_ROUTE_TRUTH_TABLE = Object.freeze([
  // Legacy-compatible: explicit grants keep working exactly as they did.
  { id: 'openai-explicit', note: 'allowlisted provider, OpenAI family',
    selection: { provider: 'openai', model: 'gpt-6.1-sol' }, grants: ['openai', 'cpa'],
    apis: { openai: 'openai-responses' }, expect: { state: 'ready', visible: true, eligible: true } },
  { id: 'codex-explicit', note: 'OpenAI Codex responses API',
    selection: { provider: 'openai-codex', model: 'gpt-5-codex' }, grants: ['openai-codex'],
    apis: { 'openai-codex': 'openai-codex-responses' }, expect: { state: 'ready', visible: true, eligible: true } },
  { id: 'gateway-flat-id', note: 'gateway provider with a flat OpenAI ID',
    selection: { provider: 'cpa', model: 'gpt-6.1-sol' }, grants: ['cpa'],
    apis: { cpa: 'openai-responses' }, expect: { state: 'ready', visible: true, eligible: true } },
  { id: 'gateway-grok', note: 'gateway provider with a flat Grok ID',
    selection: { provider: 'cpa', model: 'grok-4.7' }, grants: ['cpa'],
    apis: { cpa: 'openai-responses' }, expect: { state: 'ready', visible: true, eligible: true } },
  { id: 'openai-o-series', note: 'o-series reasoning model',
    selection: { provider: 'openai', model: 'o3' }, grants: ['openai'],
    apis: { openai: 'openai-responses' }, expect: { state: 'ready', visible: true, eligible: true } },

  // Route-scoped and family-scoped grants: the authorization units this scheme introduces.
  { id: 'route-grant-model', note: 'exact route grant on a namespaced ID',
    selection: { provider: 'magpie', model: 'cpa/gpt-6.1-sol' },
    grants: [{ provider: 'magpie', model: 'cpa/gpt-6.1-sol' }],
    expect: { state: 'ready', visible: true, eligible: true } },
  { id: 'route-grant-family', note: 'family grant covers every OpenAI-family route on that provider',
    selection: { provider: 'magpie', model: 'cpa/gpt-6.1-sol' },
    grants: [{ provider: 'magpie', family: 'openai' }],
    expect: { state: 'ready', visible: true, eligible: true } },
  { id: 'route-grant-family-scope', note: 'an OpenAI family grant never covers a Grok route',
    selection: { provider: 'magpie', model: 'cpa/grok-4.7' },
    grants: [{ provider: 'magpie', family: 'openai' }],
    expect: { state: 'needs-verification', visible: true, eligible: false } },
  { id: 'route-grant-provider-wide', note: 'provider-wide grant still covers every family (legacy semantics)',
    selection: { provider: 'magpie', model: 'cpa/grok-4.7' }, grants: ['magpie'],
    expect: { state: 'ready', visible: true, eligible: true } },

  // Step-1 regression: a namespaced OpenAI ID is a candidate instead of invisible.
  { id: 'namespaced-openai-ungranted', note: 'the reported bug: Magpie + cpa/gpt-6.1-sol',
    selection: { provider: 'magpie', model: 'cpa/gpt-6.1-sol' }, grants: [],
    apis: { magpie: 'openai-completions' }, before: 'hidden', expect: { state: 'needs-verification', visible: true, eligible: false } },
  { id: 'namespaced-grok-ungranted', note: 'namespaced Grok, no grant',
    selection: { provider: 'magpie', model: 'cpa/grok-4.7' }, grants: [],
    expect: { state: 'needs-verification', visible: true, eligible: false } },
  { id: 'namespaced-unicode', note: 'CJK namespace',
    selection: { provider: '安和桥', model: '安和桥/grok-4.7' }, grants: ['安和桥'],
    expect: { state: 'ready', visible: true, eligible: true } },
  { id: 'double-namespace', note: 'two namespace segments',
    selection: { provider: 'proxy', model: 'openai/gpt-6.1-sol' }, grants: [],
    expect: { state: 'needs-verification', visible: true, eligible: false } },
  { id: 'namespace-is-not-authority', note: 'a grant on the ID prefix must not authorize the route',
    selection: { provider: 'magpie', model: 'cpa/gpt-6.1-sol' }, grants: ['cpa'],
    expect: { state: 'needs-verification', visible: true, eligible: false } },
  { id: 'grant-on-other-provider', note: 'a grant for a different provider ID does not transfer',
    selection: { provider: 'magpie', model: 'cpa/gpt-6.1-sol' }, grants: ['openai', 'openai-codex'],
    expect: { state: 'needs-verification', visible: true, eligible: false } },

  // Evidence: verified without a grant still needs consent; rejected suppresses injection.
  { id: 'verified-no-grant', note: 'probe saw the upstream echo Priority, but nothing is authorized',
    selection: { provider: 'magpie', model: 'cpa/gpt-6.1-sol' }, grants: [],
    routes: { 'magpie\u0000cpa/gpt-6.1-sol': { priority: 'verified' } },
    expect: { state: 'grant-missing', visible: true, eligible: false } },
  { id: 'rejected-with-grant', note: 'upstream ignored Priority even though the route is authorized',
    selection: { provider: 'openai', model: 'gpt-6.1-sol' }, grants: ['openai'],
    routes: { 'openai\u0000gpt-6.1-sol': { priority: 'rejected' } },
    expect: { state: 'rejected', visible: true, eligible: false } },
  { id: 'rejected-namespaced', note: 'rejection is per route, not per provider',
    selection: { provider: 'magpie', model: 'cpa/gpt-6.1-sol' }, grants: ['magpie'],
    routes: { 'magpie\u0000cpa/gpt-6.1-sol': { priority: 'rejected' } },
    expect: { state: 'rejected', visible: true, eligible: false } },
  { id: 'verified-and-granted', note: 'evidence plus grant is ready',
    selection: { provider: 'magpie', model: 'cpa/gpt-6.1-sol' }, grants: ['magpie'],
    routes: { 'magpie\u0000cpa/gpt-6.1-sol': { priority: 'verified' } },
    expect: { state: 'ready', visible: true, eligible: true } },

  // API shape: Priority is request-level, so only OpenAI-shaped endpoints qualify.
  { id: 'api-unknown', note: 'provider API not resolvable yet: stay a candidate',
    selection: { provider: 'custom', model: 'gpt-6.1-sol' }, grants: ['custom'],
    expect: { state: 'ready', visible: true, eligible: true } },
  { id: 'api-completions', note: 'OpenAI completions endpoint',
    selection: { provider: 'custom', model: 'gpt-6.1-sol' }, grants: ['custom'],
    apis: { custom: 'openai-completions' }, expect: { state: 'ready', visible: true, eligible: true } },
  { id: 'api-anthropic', note: 'Anthropic-shaped endpoint cannot carry service_tier',
    selection: { provider: 'custom', model: 'gpt-6.1-sol' }, grants: ['custom'],
    apis: { custom: 'anthropic-messages' }, before: 'hidden', expect: { state: 'api-incompatible', visible: false, eligible: false } },

  // Negative cases: no grant, no family, no injection.
  { id: 'other-family-flat', note: 'GLM on a granted gateway',
    selection: { provider: 'magpie', model: 'glm-5.3-flash' }, grants: ['magpie'],
    expect: { state: 'not-candidate', visible: false, eligible: false } },
  { id: 'other-family-namespaced', note: 'GLM behind a namespace on a granted gateway',
    selection: { provider: 'magpie', model: 'cpa/glm-5.3-flash' }, grants: ['magpie'],
    expect: { state: 'not-candidate', visible: false, eligible: false } },
  { id: 'other-family-deepseek', note: 'DeepSeek behind a namespace on a granted gateway',
    selection: { provider: 'magpie', model: 'cpa/deepseek-v4.1-flash' },
    grants: [{ provider: 'magpie', family: 'openai' }, 'magpie'],
    expect: { state: 'not-candidate', visible: false, eligible: false } },
  { id: 'legacy-grok-3', note: 'Grok 3 is out of scope',
    selection: { provider: 'xai', model: 'grok-3' }, grants: ['xai'],
    expect: { state: 'not-candidate', visible: false, eligible: false } },
  { id: 'family-in-namespace-only', note: 'the family token must be the final segment',
    selection: { provider: 'proxy', model: 'grok-4.7/claude-sonnet' }, grants: ['proxy'],
    expect: { state: 'not-candidate', visible: false, eligible: false } },
  { id: 'traversal', note: 'path traversal inside a model ID',
    selection: { provider: 'magpie', model: 'cpa/../gpt-6.1-sol' }, grants: ['magpie'],
    expect: { state: 'not-candidate', visible: false, eligible: false } },
  { id: 'empty-segment', note: 'empty namespace segment',
    selection: { provider: 'magpie', model: 'cpa//gpt-6.1-sol' }, grants: ['magpie'],
    expect: { state: 'not-candidate', visible: false, eligible: false } },
  { id: 'query-string', note: 'a URL fragment is not a model ID',
    selection: { provider: 'magpie', model: 'cpa/gpt-6.1-sol?x=1' }, grants: ['magpie'],
    expect: { state: 'not-candidate', visible: false, eligible: false } },
  { id: 'no-selection', note: 'blank session with no default model',
    selection: null, grants: ['openai'],
    expect: { state: 'not-candidate', visible: false, eligible: false } },
]);

const FAMILIES = Object.freeze([
  { family: 'openai', model: 'proxy-model/gpt-6.1-sol' },
  { family: 'xai', model: 'proxy-model/grok-4.7' },
  { family: 'other', model: 'proxy-model/glm-5.3-flash' },
]);

const GRANTS = Object.freeze([
  { id: 'none', grants: [] },
  { id: 'provider', grants: ['gateway'] },
  { id: 'family', grants: [{ provider: 'gateway', family: 'openai' }] },
  { id: 'model', grants: [{ provider: 'gateway', model: 'proxy-model/gpt-6.1-sol' }] },
]);

const EVIDENCE = Object.freeze(['unknown', 'verified', 'rejected']);

/** Every combination of family, grant scope and evidence: the grid the resolver must satisfy. */
export const FAST_ROUTE_MATRIX = FAST_ROUTE_MATRIX_BUILD();
function FAST_ROUTE_MATRIX_BUILD() {
  const rows = [];
  for (const family of FAMILIES) for (const grant of GRANTS) for (const evidence of EVIDENCE) {
    const key = 'gateway\u0000' + family.model;
    rows.push(Object.freeze({
      id: family.family + '/' + grant.id + '/' + evidence,
      family: family.family, grant: grant.id, evidence,
      selection: { provider: 'gateway', model: family.model },
      grants: grant.grants,
      routes: evidence === 'unknown' ? null : { [key]: { priority: evidence } },
    }));
  }
  return Object.freeze(rows);
}

/** The rule the grid is asserted against, written independently of the resolver. */
export function expectedMatrixState(row) {
  if (row.family === 'other') return 'not-candidate';
  if (row.evidence === 'rejected') return 'rejected';
  // The model-scoped grant names the OpenAI model ID, so it only ever covers that route.
  const covers = row.grant === 'provider' || (row.grant !== 'none' && row.family === 'openai');
  if (covers) return 'ready';
  return row.evidence === 'verified' ? 'grant-missing' : 'needs-verification';
}
