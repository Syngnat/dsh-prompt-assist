import { parseSuggestionOutput } from './suggestion-result.js';
import { runWithPriority } from './priority-scope.js';
import { isOpenAISelection } from '../policy.js';
import { providerFailureCode } from './provider-failure.js';

export function failure(code) { return Object.assign(new Error(code), { code }); }

export async function resolveAssistRoute(ctx, agent, settings, fastService, providers, signal) {
  const selected = settings.followSession ? fastService.selection(agent) : settings;
  if (!selected?.provider || !selected?.model) throw failure('not-configured');
  const route = { provider: selected.provider, model: selected.model };
  const effort = selected.reasoningEffort;
  if (effort) route.reasoningEffort = effort;
  const metadata = await ctx.llm.resolveModelInfo(route.provider, route.model, signal);
  if (effort && !metadata.reasoning?.efforts.some(item => item.id === effort)) throw failure('unsupported-effort');
  const fastSkipped = settings.fast === true && !isOpenAISelection(route, providers);
  return { ...route, fast: settings.fast === true && !fastSkipped, fastSkipped, metadata };
}

/** Model quotas belong to the captured provider configuration, never this feature. */
export async function callAssistModel(ctx, agent, route, prompt, feature, signal, createUserMessage, onText, onPrepared) {
  if (typeof createUserMessage !== 'function') throw failure('not-configured');
  const config = { provider: route.provider, model: route.model };
  if (route.reasoningEffort) config.reasoningEffort = route.reasoningEffort;
  const prepared = await ctx.llm.prepareCall(config, signal);
  const available = prepared.context?.contextWindow;
  const outputBudget = prepared.config.maxTokens;
  if (!Number.isFinite(available) || available <= 0) throw failure('context-unknown');
  if (outputBudget !== undefined && (!Number.isSafeInteger(outputBudget) || outputBudget <= 0)) throw failure('invalid-config');
  const meter = typeof ctx.get === 'function' ? ctx.get('tokenMeter') : ctx.tokenMeter;
  if (typeof meter?.estimateMessage !== 'function') throw failure('context-unknown');
  const message = createUserMessage({ content: [{ type: 'text', text: prompt.user }], source: { kind: 'plugin', plugin: '@local/dsh-openai-fast' } });
  // Estimator-only system message; neither it nor this call is appended to chat history.
  const system = { ...message, role: 'system', source: { kind: 'system-prompt' }, content: [{ type: 'text', text: prompt.system }] };
  const counts = [meter.estimateMessage(system), meter.estimateMessage(message)];
  if (counts.some(value => !Number.isFinite(value) || value < 0)) throw failure('context-unknown');
  const inputTokensEstimate = counts[0] + counts[1];
  // Use the Host's heuristic, not UTF-8 bytes. The provider remains the final token authority.
  if (inputTokensEstimate > available) throw failure('context-overflow');
  signal?.throwIfAborted();
  onPrepared?.({ outputBudget: outputBudget ?? null,
    contextWindow: available, effort: prepared.config.reasoningEffort ?? '' });
  const started = performance.now();
  return runWithPriority(agent.id, route.fast, async () => {
    let text = '', ttftMs = null, completed = false;
    const options = { ...prepared.config, sessionId: agent.id, signal, system: prompt.system, messages: [message] };
    for await (const chunk of prepared.stream(options)) {
      signal?.throwIfAborted();
      if (chunk.type === 'text-delta') {
        if (ttftMs === null && chunk.text) ttftMs = performance.now() - started;
        text += chunk.text;
        if (chunk.text && feature !== 'suggest') onText?.(text);
      }
      if (chunk.type === 'finish') {
        if (chunk.reason.kind !== 'stop') throw failure(chunk.reason.kind === 'aborted' ? 'cancelled' : chunk.reason.kind === 'max-tokens' ? 'output-limit'
          : chunk.reason.kind === 'error' ? providerFailureCode(chunk.reason.failure) : 'model-failed');
        completed = true;
      }
    }
    if (!completed || !text.trim()) throw failure('empty-result');
    signal?.throwIfAborted();
    const result = feature === 'suggest' ? parseSuggestionOutput(text) : { text: text.trim() };
    return { ...result, outputBudgetTokens: outputBudget ?? null, contextWindowTokens: available, inputTokensEstimate,
      resolvedReasoningEffort: prepared.config.reasoningEffort ?? '', timing: { ttftMs, totalMs: performance.now() - started } };
  });
}
