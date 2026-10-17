import { DEFAULT_PROVIDERS } from './policy.js';
import { PROJECTION_KEY, initialFastState, foldFastState } from './projection.js';
import { createFastViews } from './projection-v2.js';
export { COMMAND_NAME } from './projection.js';

export function initialInheritedFastState(header, inheritedEventCount = 0) {
  return { ...initialFastState(header, inheritedEventCount), explicit: false };
}

export function foldInheritedFastState(state, event) {
  const next = foldFastState(state, event);
  if (next === state) return state;
  if (event.type === 'command/done' && event.data.kind === 'success'
    && Object.hasOwn(state.pending, event.data.commandId)) {
    return { ...next, explicit: true };
  }
  return next;
}

export function createFastProjection(z, providers = DEFAULT_PROVIDERS) {
  return {
    key: PROJECTION_KEY, stateVersion: 3,
    stateSchema: z.object({
      enabled: z.boolean(), explicit: z.boolean(), floor: z.number().int().nonnegative(),
      pending: z.record(z.string(), z.boolean()),
    }),
    init: initialInheritedFastState, apply: foldInheritedFastState,
    wire: {
      viewSchema: z.object({ enabled: z.boolean(), providers: z.array(z.string()) }),
      view: createFastViews(providers),
    },
  };
}
