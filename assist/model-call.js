import { runWithPriority } from './priority-scope.js';
import { isOpenAISelection } from '../policy.js';

export function failure(code) { return Object.assign(new Error(code), { code }); }

export async function resolveAssistRoute(ctx, agent, settings, fastService, providers, signal) {
  const selected = settings.followSession ? fastService.selection(agent) : settings;
  if (!selected?.provider || !selected?.model) throw failure('not-configured');
  const route = { provider: selected.provider, model: selected.model };
  const effort = selected.reasoningEffort;
  if (effort) route.reasoningEffort = effort;
  const metadata = await ctx.llm.resolveModelInfo(route.provider, route.model, signal);
  if (effort && !metadata.reasoning?.efforts.some(item => item.id === effort)) throw failure('unsupported-effort');
  if (settings.fast && !isOpenAISelection(route, providers)) throw failure('fast-unsupported');
  return { ...route, fast: settings.fast === true, metadata };
}

/** Consume within AsyncLocalStorage, not merely create an iterator within it. */
export async function callAssistModel(ctx, agent, route, prompt, feature, signal, createUserMessage, onText) {
  if (typeof createUserMessage !== 'function') throw failure('not-configured');
  const maxTokens = feature === 'suggest' ? 1024 : 4096;
  const inputBytes = Buffer.byteLength(prompt.system + prompt.user, 'utf8');
  const config = { provider: route.provider, model: route.model, maxTokens };
  if (route.reasoningEffort) config.reasoningEffort = route.reasoningEffort;
  const prepared = await ctx.llm.prepareCall(config, signal);
  const available = prepared.context?.contextWindow ?? route.metadata.context?.contextWindow;
  if (!Number.isFinite(available) || available <= 0) throw failure('context-unknown');
  if (inputBytes > 262144 || (available && inputBytes + maxTokens + 1024 > available)) throw failure('context-overflow');
  signal?.throwIfAborted();
  const started = performance.now();
  return runWithPriority(agent.id, route.fast, async () => {
    let text = '', ttftMs = null, completed = false;
    const options = {
      ...prepared.config, sessionId: agent.id, signal, system: prompt.system,
      messages: [createUserMessage({ content: [{ type: 'text', text: prompt.user }], source: { kind: 'plugin', plugin: '@local/dsh-openai-fast' } })],
    };
    for await (const chunk of prepared.stream(options)) {
      signal?.throwIfAborted();
      if (chunk.type === 'text-delta') {
        if (ttftMs === null && chunk.text) ttftMs = performance.now() - started;
        text += chunk.text;
        if (text.length > 65536) throw failure('output-too-large');
        if (chunk.text) onText?.(text);
      }
      if (chunk.type === 'finish') {
        if (chunk.reason.kind !== 'stop') throw failure(chunk.reason.kind === 'aborted' ? 'cancelled' : chunk.reason.kind === 'max-tokens' ? 'output-limit' : 'model-failed');
        completed = true;
      }
    }
    if (!completed || !text.trim()) throw failure('empty-result');
    return { text: text.trim(), resolvedReasoningEffort: prepared.config.reasoningEffort ?? '', timing: { ttftMs, totalMs: performance.now() - started } };
  });
}
