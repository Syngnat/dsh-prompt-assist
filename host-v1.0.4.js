import { createRequire } from 'node:module';
import { resolveAdapterEntry } from './adapter-locator.js';
import { pathToFileURL } from 'node:url';
import zh from './locale/zh.json' with { type: 'json' };
import { DEFAULT_PROVIDERS } from './policy.js';
import { COMMAND_NAME, createFastProjection } from './projection-v3.js';
import { OpenAIFastService } from './service-v2.js';
import { installFastBridge } from './bridge.js';
import { applyModelCapabilities } from './model-capabilities.js';

export const inject = ['commands', 'sessionProjections', 'agentDefaultModel', 'agents', 'tools', 'llm', 'settings'];

export async function apply(ctx, config = {}) {
  const adapterEntry = await resolveAdapterEntry(ctx, config);
  const adapterURL = pathToFileURL(adapterEntry);
  const adapterRequire = createRequire(adapterURL);
  const schemaRequire = createRequire(adapterRequire.resolve('@deepseek-ai/schemastery'));
  const [{ PiAiAdapter }, { z }] = await Promise.all([
    import(adapterURL.href), import(pathToFileURL(schemaRequire.resolve('zod')).href),
  ]);
  const configured = config?.providers ?? [...DEFAULT_PROVIDERS];
  if (Array.isArray(configured)) {
    if (configured.some(value => typeof value !== 'string' || !value)) {
      throw new Error('OpenAI Fast: providers must contain explicit non-empty route IDs');
    }
  } else if (typeof configured !== 'function') {
    throw new Error('OpenAI Fast: providers must be a list or a live provider resolver');
  }
  // A resolver lets profile authorization take effect without rebuilding projections or the bridge.
  const providers = typeof configured === 'function' ? configured : () => configured;
  const capabilityUpdates = await applyModelCapabilities(ctx, config.modelCapabilities ?? []);
  const t = key => zh[key] ?? key;
  ctx.sessionProjections.register(createFastProjection(z, providers));
  const service = new OpenAIFastService(ctx, providers, t);
  ctx.effect(() => installFastBridge(PiAiAdapter, sessionId => {
    const agent = ctx.agents.get(sessionId);
    return agent !== undefined && service.enabled(agent);
  }, providers));
  ctx.commands.register({
    name: COMMAND_NAME, definitionId: '@local/dsh-openai-fast/command/v1', recordInput: true,
    description: t('fast.command'), input: { hint: 'on | off | status' },
    handler: invocation => service.command(invocation),
  });
  ctx.tools.register({
    name: 'openai_fast',
    description: 'Read or change Fast (request-level Priority) for this session. It applies to authorized OpenAI gpt/o and xAI Grok 4+ routes; Priority may incur extra charges. Root sessions start off; local subagents inherit their parent unless explicitly overridden.',
    parameters: {
      type: 'object', properties: {
        action: { type: 'string', enum: ['status', 'on', 'off'], description: 'status reads preference, inheritance and model capabilities; on/off explicitly sets this session’s preference.' },
      }, required: ['action'], additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object', properties: {
          enabled: { type: 'boolean' }, eligible: { type: 'boolean' }, inherited: { type: 'boolean' },
          provider: { type: 'string' }, model: { type: 'string' },
          reasoningEffort: { oneOf: [{ type: 'string' }, { type: 'null' }] },
          supportedReasoningEfforts: { oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }] },
          modelCapabilityFix: { type: 'string', enum: ['updated', 'unchanged', 'not-configured', 'failed', 'not-requested'] },
        }, required: ['enabled', 'eligible', 'inherited', 'provider', 'model', 'reasoningEffort', 'supportedReasoningEfforts', 'modelCapabilityFix'], additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: async (args, exec) => {
      const value = await service.run(exec.agent, args?.action, exec.signal);
      let metadata;
      if (args?.action === 'status') {
        try { metadata = await ctx.llm.resolveModelInfo(value.provider, value.model, exec.signal); }
        catch { /* Missing metadata must not mutate the preference or mask a completed save. */ }
      }
      return {
        ...value,
        reasoningEffort: value.reasoningEffort ?? metadata?.reasoning?.defaultEffort ?? null,
        supportedReasoningEfforts: metadata?.reasoning?.efforts.map(effort => effort.id) ?? null,
        modelCapabilityFix: capabilityUpdates.find(update => update.provider === value.provider && update.model === value.model)?.status ?? 'not-requested',
      };
    },
    isConcurrencySafe: args => args?.action === 'status',
  });
}
