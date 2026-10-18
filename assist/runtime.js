import { ASSIST_KEY, ASSIST_COMMAND } from './identity.js';
export { ASSIST_KEY } from './identity.js';
import { createHash } from 'node:crypto';
import { normalizeConfig } from './config.js';
import { selectQA } from './context.js';
import { readSelectedFiles } from './files.js';
import { buildAssistPrompt } from './prompts.js';
import { callAssistModel, resolveAssistRoute, failure } from './model-call.js';
import { fileReaders } from './file-adapter.js';

const FEATURES = ['suggest', 'enhance'];
const CODES = new Set(['invalid-config','invalid-enabled','invalid-follow-session','invalid-fast','invalid-provider','invalid-model','invalid-effort','model-required','invalid-reference','invalid-context','invalid-feature','invalid-draft','empty-draft','invalid-file-entry','invalid-file-path','invalid-file-bytes','file-reader-unavailable','file-read-failed','invalid-rounds','invalid-request','not-configured','disabled','unsupported-effort','fast-unsupported','no-context','context-overflow','context-unknown','file-type-unsupported','unsupported-file','file-too-large','total-too-large','files-too-large','sensitive-file','binary-file','invalid-file','model-failed','invalid-suggestion','empty-result','cancelled','stale-context','busy','forbidden','invalid-receipt','request-too-large','output-too-large','output-limit','timeout','save-failed','not-a-file','unknown-action','file-consent-required']);

export class AssistRuntime {
  constructor(ctx, fastService, providers, createUserMessage) {
    this.createUserMessage = createUserMessage;
    this.ctx = ctx;
    this.fastService = fastService;
    this.providers = providers;
    this.jobs = new Map();
    this.cache = new Map();
    this.transportReads = new Map();
  }

  async agent(id) {
    if (typeof id !== 'string' || id.length > 180) throw failure('invalid-request');
    let agent = this.ctx.agents.get(id);
    if (!agent) {
      const controller = this.ctx.get('sessionController');
      if (!controller) throw failure('forbidden');
      const resolved = await controller.resolveAgent(id);
      if ('error' in resolved) throw failure('forbidden');
      agent = resolved.agent;
    }
    if (!agent || agent.session.header.origin === 'subagent') throw failure('forbidden');
    return agent;
  }

  projection(agent) { return this.ctx.sessionProjections.stateOf(agent.session, ASSIST_KEY); }

  noteTransportRead(id) {
    this.transportReads.set(id, Date.now());
    if (this.transportReads.size > 64) this.transportReads.delete(this.transportReads.keys().next().value);
  }

  state(agent) {
    const state = this.projection(agent);
    const selected = this.fastService.selection(agent);
    const goalActive = this.ctx.get('goals')?.get(agent)?.phase === 'active';
    return {
      settings: { suggest: { ...state.settings.suggest }, enhance: { ...state.settings.enhance } }, qaId: state.qaId, qaCount: state.rounds.length,
      busy: state.busy || goalActive,
      transport: { kind: 'connection-rpc', lastSuccessfulUIRead: this.transportReads.get(agent.id) ?? null },
      current: { ...selected, reasoningEffort: selected.reasoningEffort ?? '', fast: this.fastService.enabled(agent) },
      limits: { fileBytes: 65536, totalBytes: 131072, suggestTokens: 1024, enhanceTokens: 4096, requestMs: 120000 },
      capabilities: { inlineGhost: false, structuredApply: false },
    };
  }

  async validateConfig(agent, input, signal) {
    if (!input || ['enabled','followSession','provider','model','reasoningEffort','fast','rounds'].some(key => !Object.hasOwn(input, key))) throw failure('invalid-config');
    const config = normalizeConfig(input);
    if (config.enabled) await resolveAssistRoute(this.ctx, agent, config, this.fastService, this.providers, signal);
    return config;
  }

  async save(agent, input, signal) {
    if (!FEATURES.includes(input.feature)) throw failure('invalid-request');
    const config = await this.validateConfig(agent, input.config, signal);
    const result = await this.ctx.commands.execute(agent, '/' + ASSIST_COMMAND + ' ' + JSON.stringify({ feature: input.feature, config }), [], signal);
    if (result?.result?.kind !== 'success') throw failure('save-failed');
    this.jobs.get(`${agent.id}:${input.feature}`)?.controller.abort();
    this.cache.delete(`${agent.id}:${input.feature}`);
    return this.state(agent);
  }

  async catalog(provider) {
    const providers = this.ctx.llm.listProviders();
    if (!provider) return { providers, models: [] };
    if (!providers.some(item => item.id === provider)) throw failure('not-configured');
    const models = await this.ctx.llm.listModels(provider);
    return { providers, models: models.map(item => ({ provider, id: item.id, name: item.name })) };
  }

  async model(provider, model, signal) {
    const metadata = await this.ctx.llm.resolveModelInfo(provider, model, signal);
    const { isOpenAISelection } = await import('../policy.js');
    return { efforts: metadata.reasoning?.efforts ?? [], contextWindow: metadata.context?.contextWindow,
      fastEligible: isOpenAISelection({ provider, model }, this.providers) };
  }

  async dispatch(input, options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure('invalid-request');
    const agent = options.agent ?? await this.agent(input.sessionId);
    switch (input.action) {
      case 'state': case 'status': return this.state(agent);
      case 'save': return this.save(agent, input, options.signal);
      case 'catalog': return this.catalog(input.provider);
      case 'model': return this.model(input.provider, input.model, options.signal);
      case 'generate': return this.ctx.agents.withInitiator(agent, () => this.generate(agent, input, options));
      default: throw failure('unknown-action');
    }
  }

  async generate(agent, input, options) {
    if (!FEATURES.includes(input.feature)) throw failure('invalid-request');
    const state = this.projection(agent), settings = state.settings[input.feature];
    if (!settings?.enabled) throw failure('disabled');
    if (typeof input.draft !== 'string' || input.draft.length > 20000 || !Number.isSafeInteger(input.draftRev)) throw failure('invalid-request');
    if (input.feature === 'enhance' && !input.draft.trim()) throw failure('invalid-request');
    if (input.feature === 'suggest' && (this.state(agent).busy || input.draft !== '' || input.qaId !== state.qaId)) throw failure('stale-context');
    const entries = input.files ?? [];
    if (!Array.isArray(entries) || entries.length > 32 || (entries.length && !options.fromUI)) throw failure('file-consent-required');
    if (input.references !== undefined && (!Array.isArray(input.references) || input.references.length > 100)) throw failure('invalid-request');
    const request = { ...input, files: entries.map(entry => ({ ...entry })), references: (input.references ?? []).map(ref => typeof ref === 'object' && ref ? { ...ref } : ref) };
    const selected = settings.followSession ? { ...this.fastService.selection(agent) } : { ...settings };
    const explicit = { ...settings, followSession: false, provider: selected.provider, model: selected.model, reasoningEffort: selected.reasoningEffort ?? '' };
    const qa = selectQA(state, settings.rounds), qaId = state.qaId;
    if (!qa.length && input.feature === 'suggest') throw failure('no-context');
    const readers = entries.length ? fileReaders(this.ctx, agent) : {};
    const slot = agent.id + ':' + input.feature;
    const rawKey = createHash('sha256').update(JSON.stringify([input.feature, input.draft, qaId, request.files, request.references, settings, selected])).digest('hex');
    const active = this.jobs.get(slot);
    if (active?.rawKey === rawKey) {
      const listener=text=>{if(!options.signal?.aborted)options.onText?.(text);};
      if(active.listeners.size>=64)throw failure('busy');
      active.listeners.add(listener);
      return active.promise.then(value=>({...value,draftRev:input.draftRev})).finally(()=>active.listeners.delete(listener));
    }
    active?.controller.abort();
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, options.signal ?? new AbortController().signal, AbortSignal.timeout(120000)]);
    const job = { rawKey, controller, promise: null, listeners: new Set() };
    if(options.onText)job.listeners.add(options.onText);
    const onText=text=>{signal.throwIfAborted();for(const listener of job.listeners)listener(text);};
    this.jobs.set(slot, job);
    job.promise = Promise.resolve().then(() => this.preflight(agent, request, settings, explicit, qa, qaId, readers, slot, signal, onText))
      .finally(() => { if (this.jobs.get(slot) === job) this.jobs.delete(slot); });
    return job.promise;
  }

  async preflight(agent, input, settings, explicit, qa, qaId, readers, slot, signal, onText) {
    const check = () => {
      signal.throwIfAborted();
      if (this.projection(agent).settings[input.feature] !== settings || (input.feature === 'suggest' && this.projection(agent).qaId !== qaId)) throw failure('stale-context');
    };
    check();
    const route = await resolveAssistRoute(this.ctx, agent, explicit, this.fastService, this.providers, signal);
    check();
    const files = await readSelectedFiles(input.files, { ...readers, signal });
    check();
    const prompt = buildAssistPrompt(input.feature, input.draft, qa, files.files, input.references);
    const identity = { provider: route.provider, model: route.model, effort: route.reasoningEffort ?? route.metadata.reasoning?.defaultEffort ?? '', fast: route.fast };
    const key = createHash('sha256').update(JSON.stringify([input.feature, input.draft, qaId, settings, prompt, identity])).digest('hex');
    const cached = this.cache.get(slot);
    if (cached?.key === key && cached.expires > Date.now()) return { ...cached.value, draftRev: input.draftRev, cached: true };
    check();
    const value = await this.finish(agent, input, route, prompt, files, qaId, signal, onText);
    check();
    this.cache.set(slot, { key, value, expires: Date.now() + 60000 });
    return value;
  }

  async finish(agent, input, route, prompt, files, qaId, signal, onText) {
    const generated = await callAssistModel(this.ctx, agent, route, prompt, input.feature, signal, this.createUserMessage, onText);
    if (input.feature === 'suggest' && this.projection(agent).qaId !== qaId) throw failure('stale-context');
    return {
      ...generated, original: input.draft, draftRev: input.draftRev, qaId, feature: input.feature,
      structured: (input.references?.length ?? 0) > 0,
      route: { provider: route.provider, model: route.model, reasoningEffort: generated.resolvedReasoningEffort ?? route.reasoningEffort ?? '', fast: route.fast },
      filesRead: files.files.map(file => ({ name: file.name, bytes: file.bytes })), warnings: files.warnings,
    };
  }

  errorCode(error) {
    if (error?.code === 'aborted' || error?.name === 'AbortError') return 'cancelled';
    if (error?.name === 'TimeoutError') return 'timeout';
    if (error?.code === 'FS_TOO_LARGE') return 'file-too-large';
    return CODES.has(error?.code) ? error.code : 'model-failed';
  }

  dispose() { for (const job of this.jobs.values()) job.controller.abort(); this.jobs.clear(); this.cache.clear(); this.transportReads.clear(); }
  release(id) {
    this.transportReads.delete(id);
    for (const feature of FEATURES) {
      const key = `${id}:${feature}`;
      this.jobs.get(key)?.controller.abort(); this.jobs.delete(key); this.cache.delete(key);
    }
  }
}
