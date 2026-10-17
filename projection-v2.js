import { DEFAULT_PROVIDERS } from './policy.js';
import { PROJECTION_KEY, initialFastState, foldFastState } from './projection.js';
export { COMMAND_NAME } from './projection.js';

/** Host configuration is not a Client boot field. Publish safe policy explicitly. */
export function createFastViews(providers = DEFAULT_PROVIDERS) {
  const allowed = Object.freeze([...providers]);
  const off = Object.freeze({ enabled: false, providers: allowed });
  const on = Object.freeze({ enabled: true, providers: allowed });
  return state => state.enabled ? on : off;
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
