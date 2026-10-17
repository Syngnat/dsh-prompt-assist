export const PROJECTION_KEY = 'local.openaiFast';
export const COMMAND_NAME = 'openai-fast';

export function initialFastState(_header, inheritedEventCount = 0) {
  return { enabled: false, floor: Number(inheritedEventCount), pending: {} };
}

/** Fold only successful, paired, own-session commands. No invented log event types. */
export function foldFastState(state, event) {
  if (event.seq < state.floor) return state;
  const data = event.data;
  if (event.type === 'command/run' && data.name === COMMAND_NAME) {
    const action = String(data.args ?? '').trim();
    if (action !== 'on' && action !== 'off') return state;
    return { ...state, pending: { ...state.pending, [data.commandId]: action === 'on' } };
  }
  if (event.type !== 'command/done'
    || !Object.hasOwn(state.pending, data.commandId)) return state;
  const enabled = data.kind === 'success' ? state.pending[data.commandId] : state.enabled;
  const pending = { ...state.pending };
  delete pending[data.commandId];
  return { ...state, enabled, pending };
}

export function createFastProjection(z) {
  const stateSchema = z.object({
    enabled: z.boolean(), floor: z.number().int().nonnegative(),
    pending: z.record(z.string(), z.boolean()),
  });
  return {
    key: PROJECTION_KEY, stateVersion: 1, stateSchema,
    init: initialFastState, apply: foldFastState,
    wire: { viewSchema: z.boolean(), view: state => state.enabled },
  };
}
