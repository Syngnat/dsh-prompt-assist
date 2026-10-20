import test from 'node:test';
import assert from 'node:assert/strict';
import { AssistRuntime } from '../assist/runtime.js';
import { initialContextState } from '../assist/context.js';
import { normalizeConfig } from '../assist/config.js';
import { fixtureEnablement } from './assist-enablement-fixture.js';

/** Offline model boundary: capture actual prepared routes and dispatched prompts, never contact providers. */
function fixture(t) {
  const agents = new Map(), states = new Map(), selections = new Map();
  const prepares = [], streams = [], metadataReads = [];
  const store = fixtureEnablement();
  function add(id, index) {
    const agent = { id, session: { id, header: {} } };
    const state = initialContextState({}, 0);
    state.settings = {
      suggest: normalizeConfig({ enabled: true, followSession: false, provider: 'legacy-provider', model: `legacy-suggest-${id}`, reasoningEffort: 'legacy-effort', rounds: index + 1 }),
      enhance: normalizeConfig({ enabled: false, followSession: false, provider: 'legacy-provider', model: `legacy-enhance-${id}`, reasoningEffort: 'legacy-effort', rounds: 4 - index }),
    };
    state.rounds = Array.from({ length: 4 }, (_, i) => ({ id: `${id}:${i}`, questionSeq: i * 2, endSeq: i * 2 + 1,
      question: `${id} question ${i}`, answer: `${id} answer ${i}`, truncated: false }));
    state.qaId = state.rounds.at(-1).id;
    state.qaCount = state.rounds.length;
    agents.set(id, agent); states.set(id, state);
    selections.set(id, { provider: index % 2 ? 'alternate' : 'openai', model: `main-${id}`, reasoningEffort: index % 2 ? 'low' : 'high' });
    return agent;
  }
  const a = add('a', 0), b = add('b', 1);
  const ctx = {
    agents: { get: id => agents.get(id), withInitiator: (_agent, operation) => operation() },
    get: name => name === 'tokenMeter' ? { estimateMessage: message => Math.ceil(message.content[0].text.length / 4) + 8 } : undefined,
    sessionProjections: { stateOf: session => states.get(session.id) },
    llm: {
      listProviders: () => [{ id: 'openai' }, { id: 'alternate' }],
      async resolveModelInfo(provider, model, signal) {
        signal?.throwIfAborted(); metadataReads.push({ provider, model });
        return { context: { contextWindow: 1000000 }, reasoning: { efforts: [{ id: 'low' }, { id: 'high' }], defaultEffort: 'low' } };
      },
      async prepareCall(config, signal) {
        signal?.throwIfAborted(); prepares.push({ ...config });
        return { config: { ...config }, context: { contextWindow: 1000000 }, async *stream(options) {
          const prompt = JSON.parse(options.messages[0].content[0].text);
          streams.push({ sessionId: options.sessionId, config: {
            provider: options.provider, model: options.model,
            ...(options.reasoningEffort === undefined ? {} : { reasoningEffort: options.reasoningEffort }),
          }, prompt });
          yield { type: 'text-delta', text: prompt.feature === 'suggest' ? JSON.stringify({ kind: 'suggestion', text: `follow up ${options.sessionId}` }) : `enhanced ${options.sessionId}` };
          yield { type: 'finish', reason: { kind: 'stop' } };
        } };
      },
    },
  };
  const runtime = new AssistRuntime(ctx, { selection: agent => ({ ...selections.get(agent.id) }), enabled: () => true }, ['openai'],
    value => ({ ...value, role: 'user' }), store);
  t.after(() => runtime.dispose());
  const save = (feature, config, agent) => runtime.dispatch({ action: 'save-global', feature, config: normalizeConfig(config),
    expectedRevision: store.getSnapshot().settingsRevision }, agent ? { agent } : {});
  async function generateAndAssert(agent, feature, route, rounds) {
    const preparedBefore = prepares.length, streamedBefore = streams.length;
    const draft = feature === 'enhance' ? `draft ${agent.id}` : '';
    const result = await runtime.dispatch({ action: 'generate', sessionId: agent.id, feature, draft, draftRev: 1, qaId: states.get(agent.id).qaId });
    assert.equal(prepares.length, preparedBefore + 1, 'each generation prepares exactly one offline model call');
    assert.equal(streams.length, streamedBefore + 1, 'each generation invokes exactly one offline model stream');
    assert.deepEqual(prepares.at(-1), route);
    assert.deepEqual(streams.at(-1).config, route);
    assert.equal(streams.at(-1).sessionId, agent.id);
    assert.deepEqual(streams.at(-1).prompt, { feature, draft,
      qa: states.get(agent.id).rounds.slice(-rounds).map(({ question, answer }) => ({ question, answer })), files: [], references: [] });
    assert.deepEqual(result.route, { ...route, reasoningEffort: route.reasoningEffort ?? '', fast: false });
    assert.equal(result.cached, undefined);
    return result;
  }
  return { runtime, store, a, b, add, states, selections, prepares, streams, metadataReads, save, generateAndAssert };
}

test('global explicit model and QA rounds govern actual generations in existing and newly created sessions', async t => {
  const f = fixture(t);
  const globalRoute = { provider: 'openai', model: 'gpt-global-enhance', reasoningEffort: 'high' };
  await f.save('enhance', { followSession: false, ...globalRoute, rounds: 2, enabled: false });
  assert.equal(f.prepares.length, 0); assert.equal(f.streams.length, 0);
  const fresh = f.add('new', 2);
  for (const agent of [f.a, f.b, fresh]) await f.generateAndAssert(agent, 'enhance', globalRoute, 2);
  assert.equal(f.streams.length, 3);
  assert.equal(f.store.getSnapshot().enabled.enhance, true);
  assert.equal(f.states.get('a').settings.enhance.model, 'legacy-enhance-a', 'legacy replay data is not rewritten');
});

test('enhancement and suggestions independently use their global model, native effort and QA count', async t => {
  const f = fixture(t);
  const enhance = { provider: 'openai', model: 'gpt-global-enhance', reasoningEffort: 'high' };
  const suggest = { provider: 'alternate', model: 'global-suggest', reasoningEffort: 'low' };
  await f.save('enhance', { followSession: false, ...enhance, rounds: 1 });
  await f.save('suggest', { followSession: false, ...suggest, rounds: 3 });
  assert.equal(f.prepares.length, 0);
  for (const agent of [f.a, f.b, f.add('new', 2)]) {
    await f.generateAndAssert(agent, 'enhance', enhance, 1);
    await f.generateAndAssert(agent, 'suggest', suggest, 3);
  }
  assert.equal(f.prepares.length, 6); assert.equal(f.streams.length, 6);
});

test('global follow-session resolves each calling session model and effort rather than the saving session', async t => {
  const f = fixture(t);
  // Save with agent a present, but stale explicit fields must not bind future calls to any route.
  await f.save('enhance', { followSession: true, provider: 'unused-provider', model: 'unused-model', reasoningEffort: 'unused-effort', rounds: 2 }, f.a);
  await f.save('suggest', { followSession: true, provider: 'unused-provider', model: 'unused-model', reasoningEffort: 'unused-effort', rounds: 3 }, f.a);
  assert.equal(f.metadataReads.length, 0, 'saving follow-session does not inspect the saving session capabilities');
  assert.equal(f.prepares.length, 0);
  // Enhancement follows the calling session's model but keeps the model's own
  // default reasoning rung: inheriting "max" made a short rewrite time out.
  const enhanceRoute = selection => ({ provider: selection.provider, model: selection.model });
  for (const agent of [f.a, f.b, f.add('new', 2)]) {
    await f.generateAndAssert(agent, 'enhance', enhanceRoute(f.selections.get(agent.id)), 2);
    await f.generateAndAssert(agent, 'suggest', f.selections.get(agent.id), 3);
  }
  // A main route change needs no global resave and must not reuse the previous generation's cache.
  const changed = { provider: 'alternate', model: 'main-a-changed', reasoningEffort: 'low' };
  f.selections.set('a', changed);
  await f.generateAndAssert(f.a, 'enhance', enhanceRoute(changed), 2);
  await f.generateAndAssert(f.a, 'suggest', changed, 3);
  assert.equal(f.prepares.length, 8); assert.equal(f.streams.length, 8);
  assert.ok(f.metadataReads.every(route => route.provider !== 'unused-provider' && route.provider !== 'legacy-provider'));
});
