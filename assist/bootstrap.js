import { installAssistStream } from './stream-transport.js';
import { ASSIST_COMMAND, LEGACY_KEY, LEGACY_COMMAND } from './identity.js';
import zh from '../locale/zh.json' with { type: 'json' };
import { initialContextState, foldContextState } from './context.js';
import { AssistRuntime, ASSIST_KEY } from './runtime.js';
import { installAssistRpc } from './rpc-transport.js';

function wireView() {
  const cache = new WeakMap();
  return state => {
    const key = `${state.qaId}:${state.rounds.length}:${state.busy}`;
    const previous = cache.get(state.settings);
    if (previous?.key === key) return previous.value;
    const value = { settings: state.settings, qaId: state.qaId, qaCount: state.rounds.length, busy: state.busy };
    cache.set(state.settings, { key, value });
    return value;
  };
}

function installTool(ctx, service) {
  ctx.tools.register({
    name: 'prompt_assist',
    description: 'Read or configure session-local prompt assistance, or generate a suggestion/enhancement when explicitly requested. Generation may incur model charges and never edits the composer. Reading files requires the user-only UI selection flow.',
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['status', 'catalog', 'model', 'configure', 'suggest', 'enhance'] },
      provider: { type: 'string' }, model: { type: 'string' },
      feature: { type: 'string', enum: ['suggest', 'enhance'], description: 'Required for configure.' },
      config: { type: 'object', description: 'Full feature settings for configure: enabled, followSession, provider, model, reasoningEffort, fast, rounds.', properties: {
        enabled: { type: 'boolean' }, followSession: { type: 'boolean' }, provider: { type: 'string' }, model: { type: 'string' },
        reasoningEffort: { type: 'string' }, fast: { type: 'boolean' }, rounds: { type: 'integer', minimum: 1, maximum: 20 },
      }, required: ['enabled','followSession','provider','model','reasoningEffort','fast','rounds'], additionalProperties: false },
      draft: { type: 'string', description: 'Original prompt for enhance; omitted for suggest.' },
    }, required: ['action'], additionalProperties: false },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (args, exec) => {
      const input = { ...args, action: args.action === 'configure' ? 'save' : args.action };
      if (args.action === 'suggest' || args.action === 'enhance') {
        input.action = 'generate'; input.feature = args.action;
        input.draft = args.draft ?? ''; input.draftRev = 0;
        input.qaId = service.projection(exec.agent).qaId;
      }
      return service.dispatch(input, { agent: exec.agent, signal: exec.signal, fromUI: false });
    },
    isConcurrencySafe: args => ['status', 'catalog', 'model'].includes(args?.action),
  });
}

export async function installAssistHost(ctx, { z, fastService, providers, createUserMessage }) {
  if (typeof createUserMessage !== 'function') throw new Error('Native message factory is unavailable');
  // Block the retired V1 handler left by an earlier unowned route until Host restart.
  ctx.sessionProjections.register({ key: LEGACY_KEY, stateVersion: 2, stateSchema: z.any(),
    init: () => ({ ...initialContextState({}, 0), busy: true, retired: true }), apply: state => state });
  const feature = z.object({ enabled: z.boolean(), followSession: z.boolean(), provider: z.string(), model: z.string(), reasoningEffort: z.string(), fast: z.boolean(), rounds: z.number().int().min(1).max(20) });
  ctx.sessionProjections.register({
    key: ASSIST_KEY, stateVersion: 2, stateSchema: z.any(),
    init: initialContextState, apply: foldContextState,
    wire: { viewSchema: z.object({ settings: z.object({ suggest: feature, enhance: feature }), qaId: z.string().nullable(), qaCount: z.number().int(), busy: z.boolean() }), view: wireView() },
  });
  const service = new AssistRuntime(ctx, fastService, providers, createUserMessage);
  ctx.effect(() => () => service.dispose());
  ctx.commands.register({ name: LEGACY_COMMAND, definitionId: '@local/dsh-openai-fast/retired-config/v2', recordInput: false,
    description: zh['assist.retired'], handler: () => ({ kind: 'error', text: 'retired' }) });
  ctx.commands.register({
    name: ASSIST_COMMAND, definitionId: '@local/dsh-openai-fast/config/v2', recordInput: true,
    description: zh['assist.command'], input: { hint: 'JSON' },
    handler: async invocation => {
      try {
        const value = JSON.parse(invocation.rawInput);
        if (!['suggest', 'enhance'].includes(value.feature)) return { kind: 'error', text: 'invalid-request' };
        await service.validateConfig(invocation.agent, value.config, invocation.signal);
        return { kind: 'success', text: 'saved' };
      } catch (error) { return { kind: 'error', text: service.errorCode(error) }; }
    },
  });
  installAssistRpc(ctx, service);
  installAssistStream(ctx, service);
  installTool(ctx, service);
  ctx.on('agent/disposed', ({ agent }) => service.release(agent.id));
  return service;
}
