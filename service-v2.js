import { COMMAND_NAME, PROJECTION_KEY } from './projection.js';
import { isOpenAISelection } from './policy.js';
import { resolveFastPreference } from './fast-scope.js';

/** UI and model tool retain one command operation and one durable preference. */
export class OpenAIFastService {
  constructor(ctx, providers, t) {
    this.ctx = ctx;
    this.providers = providers;
    this.t = t;
  }

  selection(agent) {
    const view = this.ctx.sessionProjections.snapshot(agent.session, ['modelSelection']);
    return view.values.modelSelection?.next ?? this.ctx.agentDefaultModel.currentSelection();
  }

  preference(agent) {
    return resolveFastPreference(agent, this.ctx.agents,
      current => this.ctx.sessionProjections.stateOf(current.session, PROJECTION_KEY));
  }

  enabled(agent) { return this.preference(agent).enabled; }

  status(agent) {
    const selection = this.selection(agent);
    const eligible = isOpenAISelection(selection, this.providers);
    const preference = this.preference(agent);
    return {
      enabled: eligible && preference.enabled, eligible, inherited: preference.inherited,
      provider: selection.provider, model: selection.model,
      reasoningEffort: selection.reasoningEffort ?? null,
    };
  }

  command({ agent, rawInput }) {
    const action = rawInput.trim() || 'status';
    if (!['on', 'off', 'status'].includes(action)) return { kind: 'error', text: this.t('fast.invalid') };
    if (action === 'on' && !this.status(agent).eligible) {
      return { kind: 'error', text: this.t('fast.unsupported') };
    }
    return {
      kind: 'success', text: action === 'status' ? JSON.stringify(this.status(agent))
        : this.t(action === 'on' ? 'fast.enabled' : 'fast.disabled'),
    };
  }

  async run(agent, action, signal) {
    if (!agent) throw new Error('OpenAI Fast requires the current session');
    if (action === 'status') return this.status(agent);
    if (action !== 'on' && action !== 'off') throw new Error(this.t('fast.invalid'));
    const result = await this.ctx.commands.execute(agent, `/${COMMAND_NAME} ${action}`, [], signal);
    if (result?.result.kind !== 'success') throw new Error(result?.result.text ?? this.t('fast.error'));
    return this.status(agent);
  }
}
