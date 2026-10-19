import { DEFAULT_PROVIDERS } from './policy.js';
import { PROJECTION_KEY, initialFastState, foldFastState } from './projection.js';
export { COMMAND_NAME } from './projection.js';

/** Host configuration is not a Client boot field. Publish safe policy explicitly. */
export function createFastViews(providers = DEFAULT_PROVIDERS) {
  // A getter keeps the wire view current after profile authorization without re-registering the unit.
  const list = typeof providers === 'function' ? providers : () => providers;
  let cachedKey = null, cached = null;
  return state => {
    const allowed = Object.freeze([...list()]);
    // Keep referential stability: projection change detection compares wire results by Object.is.
    const key = (state.enabled === true ? '1' : '0') + '\u0000' + allowed.join('\u0000');
    if (key === cachedKey) return cached;
    cachedKey = key;
    cached = Object.freeze({ enabled: state.enabled === true, providers: allowed });
    return cached;
  };
}

export function createFastProjection(z, providers = DEFAULT_PROVIDERS) {
  return {
    key: PROJECTION_KEY, stateVersion: 2,
    stateSchema: z.object({
      enabled: z.boolean(), floor: z.number().int().nonnegative(),
      pending: z.record(z.string(), z.boolean()),
    }),
    init: initialFastState, apply: foldFastState,
    wire: {
      viewSchema: z.object({ enabled: z.boolean(), providers: z.array(z.string()) }),
      view: createFastViews(providers),
    },
  };
}
