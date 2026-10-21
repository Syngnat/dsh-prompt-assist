import { COMMAND_NAME, PROJECTION_KEY } from './projection.js';
import { resolveFastRoute } from './fast-route.js';
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

  /** One resolver call answers both "may we inject?" and "why not?" for every call site. */
  resolution(selection) {
    return resolveFastRoute(selection, { grants: this.providers });
  }

  status(agent) {
    const selection = this.selection(agent);
    const resolution = this.resolution(selection);
    const eligible = resolution.eligible;
    const preference = this.preference(agent);
    return {
      enabled: eligible && preference.enabled, eligible, inherited: preference.inherited,
      provider: selection.provider, model: selection.model,
      reasoningEffort: selection.reasoningEffort ?? null,
      // Evidence travels with the answer so a caller never has to re-derive authorization.
      state: resolution.state, family: resolution.route?.family ?? null, api: resolution.route?.api ?? null,
      grant: resolution.grant, evidence: resolution.evidence,
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
