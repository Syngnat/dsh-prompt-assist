import {openProfileStore} from './profile-store.js';
import {installEnablementWatch} from './enablement-transport.js';
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
    const local = config => { const {enabled,...rest}=config; return rest; };
    const value = { settings: {suggest:local(state.settings.suggest),enhance:local(state.settings.enhance)}, qaId: state.qaId, qaCount: state.rounds.length, busy: state.busy };
    cache.set(state.settings, { key, value });
    return value;
  };
}

function installTool(ctx, service) {
  ctx.tools.register({
    name: 'prompt_assist',
    description: 'Read prompt assistance or change profile-wide feature switches, auxiliary model controls and QA scope for all conversations. Generate only when explicitly requested; generation may incur model charges and never edits the composer. Reading files requires the user-only UI selection flow.',
    parameters: { type: 'object', properties: {
      action: { type: 'string', enum: ['status', 'catalog', 'model', 'configure', 'set-enabled', 'set-final-answer', 'suggest', 'enhance'] },
      provider: { type: 'string' }, model: { type: 'string' },
      feature: { type: 'string', enum: ['suggest', 'enhance'], description: 'Required for configure or set-enabled.' },
      config: { type: 'object', description: 'Profile-wide controls for the selected feature: followSession, provider, model, reasoningEffort, fast, rounds. Saving affects existing and future conversations, confirms the global configuration for that feature, and does not change its global switch. followSession resolves the model of the calling conversation at generation time.', properties: {
        followSession: { type: 'boolean' }, provider: { type: 'string' }, model: { type: 'string' },
        reasoningEffort: { type: 'string' }, fast: { type: 'boolean' }, rounds: { type: 'integer', minimum: 1, maximum: 20 },
      }, required: ['followSession','provider','model','reasoningEffort','fast','rounds'], additionalProperties: false },
      enabled: { type: 'boolean', description: 'Required for set-enabled and set-final-answer. For set-final-answer it toggles the injected Codex-style closing contract. Persists for every conversation in this profile; enabling suggestions permits eligible future automatic model requests. Does not replay old Q&A.' },
      draft: { type: 'string', description: 'Original prompt for enhance; omitted for suggest.' },
    }, required: ['action'], additionalProperties: false },
    output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (args, exec) => {
      if (args.action === 'set-enabled') return service.dispatch({action:'set-enabled',feature:args.feature,enabled:args.enabled},{agent:exec.agent,signal:exec.signal});
      if (args.action === 'set-final-answer') return service.dispatch({action:'set-final-answer',enabled:args.enabled},{agent:exec.agent,signal:exec.signal});
      if (args.action === 'configure') return service.dispatch({action:'save-global',feature:args.feature,config:args.config,
        expectedRevision:service.globalEnablement().settingsRevision},{agent:exec.agent,signal:exec.signal});
      const input = { ...args };
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
  const enablement = await openProfileStore(ctx,z);
  ctx.effect(() => () => enablement.close());
  // Block the retired V1 handler left by an earlier unowned route until Host restart.
  ctx.sessionProjections.register({ key: LEGACY_KEY, stateVersion: 2, stateSchema: z.any(),
    init: () => ({ ...initialContextState({}, 0), busy: true, retired: true }), apply: state => state });
  const feature = z.object({ followSession: z.boolean(), provider: z.string(), model: z.string(), reasoningEffort: z.string(), fast: z.boolean(), rounds: z.number().int().min(1).max(20) });
  ctx.sessionProjections.register({
    key: ASSIST_KEY, stateVersion: 2, stateSchema: z.any(),
    init: initialContextState, apply: foldContextState,
    wire: { viewSchema: z.object({ settings: z.object({ suggest: feature, enhance: feature }), qaId: z.string().nullable(), qaCount: z.number().int(), busy: z.boolean() }), view: wireView() },
  });
  const service = new AssistRuntime(ctx, fastService, providers, createUserMessage, enablement);
  ctx.effect(() => () => service.dispose());
  ctx.commands.register({ name: LEGACY_COMMAND, definitionId: '@local/dsh-openai-fast/retired-config/v2', recordInput: false,
    description: zh['assist.retired'], handler: () => ({ kind: 'error', text: 'retired' }) });
  ctx.commands.register({
    name: ASSIST_COMMAND, definitionId: '@local/dsh-openai-fast/config/v2', recordInput: false,
    description: zh['assist.command'], input: { hint: 'JSON' },
    // Historical command records still replay, but a stale client must not turn a session save
    // into an unannounced profile-wide mutation. New UI and tools use save-global explicitly.
    handler: () => ({ kind: 'error', text: 'global-config-required' }),
  });
  installAssistRpc(ctx, service);
  installAssistStream(ctx, service);
  installEnablementWatch(ctx, enablement);
  installTool(ctx, service);
  ctx.on('agent/disposed', ({ agent }) => service.release(agent.id));
  return service;
}
