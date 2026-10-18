import test from "node:test";
import assert from "node:assert/strict";
import { AssistRuntime, ASSIST_KEY } from "../assist/runtime.js";
import { initialContextState, foldContextState } from "../assist/context.js";
import { normalizeConfig } from "../assist/config.js";

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function waitAbort(signal) {
  signal.throwIfAborted(); return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
}
function fixture(t) {
  const agents = new Map(), states = new Map(), selections = new Map(), goals = new Map();
  const prepares = [], streams = [], commandLog = [], fileReads = [], hooks = {}; let seq = 100;
  const encode = text => new TextEncoder().encode(text);
  for (const id of ["a", "b"]) {
    agents.set(id, { id, session: { id, header: {} } });
    const state = initialContextState({}, 0);
    state.settings = { suggest: normalizeConfig({ enabled: true }), enhance: normalizeConfig({ enabled: true }) };
    state.rounds = [{ id: "0:3", questionSeq: 0, question: `question-${id}`, answer: `answer-${id}`, endSeq: 3, truncated: false }];
    state.qaId = "0:3"; state.qaCount = 1; states.set(id, state);
    selections.set(id, { provider: "openai", model: "gpt-test", reasoningEffort: "high" });
  }
  const ctx = {
    agents: { get: id => agents.get(id), withInitiator(agent, operation) { assert.equal(agents.get(agent.id), agent); return operation(); } },
    get: name => name === "tokenMeter" ? {estimateMessage:m=>Math.ceil(m.content[0].text.length/4)+8} : name === "goals" ? { get: agent => goals.get(agent.id) } : undefined,
    sessionProjections: { stateOf(session, key) { assert.equal(key, ASSIST_KEY); return states.get(session.id); } },
    llm: {
      async resolveModelInfo(provider, model, signal) {
        signal?.throwIfAborted(); await hooks.resolve?.(provider, model, signal); signal?.throwIfAborted();
        return { provider, id: model, context: { contextWindow: 1000000 }, reasoning: { defaultEffort: "high", efforts: ["high", "xhigh"].map(id => ({ id, name: id })) } };
      },
      async prepareCall(config, signal) {
        signal?.throwIfAborted(); prepares.push({ ...config });
        return { context: {contextWindow:1000000}, config: Object.freeze({ ...config, reasoningEffort: config.reasoningEffort ?? "high" }), async *stream(options) {
          streams.push(options); const data = JSON.parse(options.messages[0].content[0].text);
          await hooks.stream?.(options, data); options.signal?.throwIfAborted();
          yield { type: "text-delta", index: 0, text: data.feature === "suggest" ? JSON.stringify({kind:"suggestion",text:`generated ${options.sessionId} ${data.draft}`}) : `generated ${options.sessionId} ${data.draft}` };
          yield { type: "finish", reason: { kind: "stop" } };
        } };
      },
      listProviders: () => [{ id: "openai", name: "Mock" }], listModels: async () => [{ id: "gpt-test", name: "Mock model" }],
    },
    commands: { async execute(agent, line, attachments, signal) {
      signal?.throwIfAborted(); commandLog.push({ line, attachments }); const commandId = `c${seq}`;
      let state = foldContextState(states.get(agent.id), { type: "command/run", seq: seq++, data: { commandId, name: line.slice(1,line.indexOf(" ")), args: line.slice(line.indexOf(" ")+1) } });
      state = foldContextState(state, { type: "command/done", seq: seq++, data: { commandId, kind: "success" } });
      states.set(agent.id, state); return { result: { kind: "success" } };
    } },
    workingDirectory: { get: () => "/workspace" },
    fs: {
      resolve: async path => ({ targetKey: path, displayPath: `/workspace/${path}` }),
      processPath: target => target.displayPath, stat: async () => ({ type: "file", size: 6 }),
      async readBytes(target, signal, maxBytes) { signal?.throwIfAborted(); fileReads.push({ target, maxBytes }); return encode("file-a"); },
    },
    fileUploads: { resolve: (agent, id) => id === `receipt-${agent.id}` ? { name: "receipt.md", bytes: 7 } : undefined },
    attachments: { async *readFileStream() { fileReads.push({ receipt: true }); yield encode("receipt"); } },
  };
  const fastService = { selection: agent => ({ ...selections.get(agent.id) }), enabled: () => true };
  const runtime = new AssistRuntime(ctx, fastService, ["openai", "alternate"], value => ({ ...value, role: "user", id: "fixture-message" })); t.after(() => runtime.dispose());
  const input = (id = "a", changes = {}) => ({ action: "generate", sessionId: id, feature: "enhance", requestId: "r1", draft: "draft", draftRev: 1, qaId: states.get(id).qaId, ...changes });
  const generate = (id = "a", changes = {}, options = {}) => runtime.dispatch(input(id, changes), { fromUI: true, ...options });
  return { ctx, runtime, agents, states, selections, goals, prepares, streams, fileReads, hooks, commandLog, input, generate };
}

test("state is content-free and disabled means zero requests; enhancement can use an empty completed-QA snapshot", async t => {
  const f = fixture(t);
  const wire = f.runtime.state(f.agents.get("a"));
  assert.doesNotMatch(JSON.stringify(wire), /question-a|answer-a|receipt/); assert.equal(wire.current.fast, true);
  f.goals.set("a", { phase: "active" }); assert.equal(f.runtime.state(f.agents.get("a")).busy, true);
  f.states.get("a").settings.enhance = normalizeConfig();
  await assert.rejects(f.generate(), { code: "disabled" });
  f.states.get("a").settings.enhance = normalizeConfig({ enabled: true });
  f.states.get("a").rounds = []; f.states.get("a").qaId = null;
  f.goals.delete("a");
  await assert.rejects(f.generate("a", {feature:"suggest",draft:""}), {code:"no-context"});assert.equal(f.prepares.length,0);
  assert.equal((await f.generate()).original,"draft");assert.equal(f.prepares.length,1);
  await assert.rejects(f.runtime.agent("missing"), { code: "forbidden" });
});

test("automatic suggestion admission rejects busy, changed draft or stale QA before model preparation", async t => {
  const f = fixture(t);
  for (const changes of [{ draft: "typing" }, { qaId: "old" }]) {
    await assert.rejects(f.generate("a", { feature: "suggest", draft: "", ...changes }), { code: "stale-context" });
  }
  f.goals.set("a", { phase: "active" });
  await assert.rejects(f.generate("a", { feature: "suggest", draft: "" }), { code: "stale-context" });
  f.goals.clear(); f.states.get("a").settings.enhance = normalizeConfig({ enabled: true, followSession: false, provider: "openai", model: "gpt-test", reasoningEffort: "unsupported" });
  await assert.rejects(f.generate(), { code: "unsupported-effort" });
  f.states.get("a").settings.enhance = normalizeConfig({ enabled: true, followSession: false, provider: "deepseek", model: "deepseek-chat", fast: true });
  await assert.rejects(f.generate(), { code: "fast-unsupported" }); assert.equal(f.prepares.length, 0);
});

test("same-feature concurrent requests deduplicate, cache briefly, then refresh after expiry", async t => {
  const f = fixture(t);
  const results = await Promise.all(Array.from({ length: 5 }, (_, index) => f.generate("a", { requestId: `r${index}`, draftRev: index + 1 })));
  assert.equal(f.prepares.length, 1); assert.ok(results.every(value => value.text === results[0].text));
  assert.deepEqual(results.map(value => value.draftRev), [1, 2, 3, 4, 5]);
  const cached = await f.generate(); assert.equal(cached.cached, true); assert.equal(f.prepares.length, 1);
  f.runtime.cache.get("a:enhance").expires = 0;
  await f.generate(); assert.equal(f.prepares.length, 2); assert.equal(f.runtime.jobs.size, 0);
});

test("follow-session provider/model changes invalidate old cached route even at identical effort", async t => {
  const f = fixture(t);
  await f.generate();
  f.selections.set("a", { provider: "openai", model: "gpt-new", reasoningEffort: "high" });
  const modelChange = await f.generate(); assert.equal(modelChange.route.model, "gpt-new");
  f.selections.set("a", { provider: "alternate", model: "gpt-new", reasoningEffort: "high" });
  const providerChange = await f.generate(); assert.equal(providerChange.route.provider, "alternate");
  assert.equal(f.prepares.length, 3);
  f.selections.set("a", { provider: "openai", model: "gpt-default" });
  const defaulted = await f.generate(); assert.equal(defaulted.route.reasoningEffort, "high");
  assert.equal(f.prepares.length, 4);
});

test("replacing one feature cancels only that slot, not another session or feature", { timeout: 3000 }, async t => {
  const f = fixture(t), started = deferred(), otherStarted = deferred(), otherRelease = deferred(); let otherSignal;
  f.hooks.stream = async (options, data) => {
    if (data.draft === "old") { started.resolve(); await waitAbort(options.signal); }
    if (options.sessionId === "b") { otherSignal = options.signal; otherStarted.resolve(); await otherRelease.promise; }
  };
  const old = f.generate("a", { draft: "old" }).catch(error => error); await started.promise;
  const other = f.generate("b"); await otherStarted.promise;
  await f.generate("a", { feature: "suggest", draft: "" });
  const replacement = await f.generate("a", { draft: "new", draftRev: 2 });
  assert.equal(f.runtime.errorCode(await old), "cancelled"); assert.equal(replacement.original, "new");
  assert.equal(otherSignal.aborted, false); assert.ok(f.runtime.cache.has("a:suggest"));
  otherRelease.resolve(); assert.equal((await other).route.provider, "openai");
});

test("successful paired save cancels its feature and leaves independent feature cache intact", { timeout: 3000 }, async t => {
  const f = fixture(t), started = deferred();
  await f.generate("a", { feature: "suggest", draft: "" });
  f.hooks.stream = async (_options, data) => { if (data.feature === "enhance") { started.resolve(); await waitAbort(_options.signal); } };
  const old = f.generate().catch(error => error); await started.promise;
  const saved = await f.runtime.dispatch({ action: "save", sessionId: "a", feature: "enhance", config: normalizeConfig({ enabled: false }) });
  assert.equal(saved.settings.enhance.enabled, false); assert.equal(f.runtime.errorCode(await old), "cancelled");
  assert.ok(f.runtime.cache.has("a:suggest")); assert.equal(f.commandLog.length, 1);
  assert.match(f.commandLog[0].line, /^\/prompt-assist-config-v2 /); assert.deepEqual(f.commandLog[0].attachments, []);
});

test("release and dispose cancel owned jobs without crossing session boundary", { timeout: 3000 }, async t => {
  const f = fixture(t), ready = deferred(); let count = 0;
  f.hooks.stream = async options => { if (++count === 2) ready.resolve(); await waitAbort(options.signal); };
  const a = f.generate("a").catch(error => error), b = f.generate("b").catch(error => error); await ready.promise;
  const bSignal = f.streams.find(item => item.sessionId === "b").signal;
  f.runtime.release("a"); assert.equal(f.runtime.errorCode(await a), "cancelled"); assert.equal(bSignal.aborted, false);
  f.runtime.dispose(); assert.equal(f.runtime.errorCode(await b), "cancelled");
  assert.equal(f.runtime.jobs.size, 0); assert.equal(f.runtime.cache.size, 0);
});

test("tool-origin file requests cannot read; explicit UI files and reference labels produce preview metadata only", async t => {
  const f = fixture(t);
  await assert.rejects(f.generate("a", { files: [{ path: "a.md", name: "a.md" }] }, { fromUI: false }), { code: "file-consent-required" });
  assert.equal(f.fileReads.length, 0); assert.equal(f.prepares.length, 0);
  const value = await f.generate("a", { files: [{ path: "a.md", name: "A.md" }, { receiptId: "receipt-a", name: "uploaded.md" }], references: [{ name: "visible reference" }] });
  assert.deepEqual(value.filesRead, [{ name: "A.md", bytes: 6 }, { name: "uploaded.md", bytes: 7 }]);
  assert.equal(value.structured, true); assert.equal(value.original, "draft"); assert.equal(value.draftRev, 1);
  assert.equal(f.prepares.length, 1); assert.equal(f.commandLog.length, 0);
  assert.doesNotMatch(JSON.stringify(f.runtime.state(f.agents.get("a"))), /file-a|receipt-a|visible reference/);
});

test("suggestion QA changes while streaming reject stale output and never populate a reusable cache", { timeout: 3000 }, async t => {
  const f = fixture(t), ready = deferred(), release = deferred();
  f.hooks.stream = async () => { ready.resolve(); await release.promise; };
  const result = f.generate("a",{feature:"suggest",draft:""}).catch(error => error); await ready.promise;
  f.states.get("a").qaId = "10:13"; release.resolve();
  assert.equal((await result).code, "stale-context"); assert.equal(f.runtime.cache.size, 0);
});

test("disable or session release during preflight cannot later start a paid model stream", { timeout: 3000 }, async t => {
  for (const change of ["disable", "release", "dispose"]) {
    const f = fixture(t), ready = deferred(), release = deferred();
    f.hooks.resolve = async () => { ready.resolve(); await release.promise; };
    const pending = f.generate().then(value => ({ value }), error => ({ error })); await ready.promise;
    if (change === "disable") await f.runtime.dispatch({ action: "save", sessionId: "a", feature: "enhance", config: normalizeConfig() });
    else if (change === "release") f.runtime.release("a");
    else f.runtime.dispose();
    release.resolve(); const result = await pending;
    assert.ok(result.error, `${change} should reject preflight completion`);
    assert.equal(f.prepares.length, 0, `${change} must prevent preparation/dispatch`); assert.equal(f.streams.length, 0);
  }
});

test("known domain error codes survive transport classification and unknown detail is never returned", t => {
  const f = fixture(t);
  for (const code of ["invalid-config", "invalid-enabled", "invalid-follow-session", "invalid-fast", "invalid-provider", "invalid-model", "invalid-effort", "invalid-rounds", "model-required",
    "invalid-reference", "invalid-context", "invalid-draft", "empty-draft", "invalid-file-entry", "invalid-file-path", "invalid-file-bytes", "file-reader-unavailable", "sensitive-file", "invalid-receipt", "not-a-file"]) {
    assert.equal(f.runtime.errorCode(Object.assign(new Error("RAW_SECRET_DETAILS"), { code })), code);
  }
  assert.equal(f.runtime.errorCode(Object.assign(new Error("RAW_SECRET_DETAILS"), { code: "UNKNOWN_UPSTREAM" })), "model-failed");
  assert.equal(f.runtime.errorCode({ code: "aborted" }), "cancelled"); assert.equal(f.runtime.errorCode({ name: "TimeoutError" }), "timeout");
});

test("caller AbortSignal cancels an active model stream and removes uncacheable work", { timeout: 3000 }, async t => {
  const f = fixture(t), ready = deferred(), controller = new AbortController();
  f.hooks.stream = async options => { ready.resolve(); await waitAbort(options.signal); };
  const pending = f.generate("a", {}, { signal: controller.signal }).catch(error => error);
  await ready.promise; controller.abort();
  assert.equal(f.runtime.errorCode(await pending), "cancelled");
  assert.equal(f.runtime.jobs.size, 0); assert.equal(f.runtime.cache.size, 0);
  assert.equal(f.runtime.state(f.agents.get("a")).current.fast, true);
});

test("cold ordinary sessions resolve through the public controller without a model call", async t => {
  const f=fixture(t); const actor=f.agents.get("a"); f.agents.delete("a"); const original=f.ctx.get;
  f.ctx.get=name=>name==="sessionController"?{async resolveAgent(id){assert.equal(id,"a");f.agents.set(id,actor);return {agent:actor};}}:original(name);
  assert.equal(await f.runtime.agent("a"),actor); assert.equal(f.prepares.length,0);
  f.agents.delete("a"); f.ctx.get=name=>name==="sessionController"?{async resolveAgent(){return {error:{message:"private detail"}};}}:original(name);
  await assert.rejects(f.runtime.agent("a"),{code:"forbidden"});
});

test('enhancement while main is busy retains its completed-QA snapshot when main finishes',async t=>{
 const f=fixture(t),ready=deferred(),release=deferred();f.states.get('a').busy=true;let captured;
 f.hooks.stream=async (_opts,data)=>{captured=data;ready.resolve();await release.promise;};
 const pending=f.generate();await ready.promise;f.states.get('a').qaId='10:13';f.states.get('a').busy=false;release.resolve();
 const value=await pending;assert.equal(value.qaId,'0:3');assert.equal(value.original,'draft');assert.equal(captured.qa[0].answer,'answer-a');assert.equal(f.prepares.length,1);
});

test('transport AbortError preserves timeout reason rather than reporting user cancellation',async t=>{
 const f=fixture(t),controller=new AbortController();
 f.hooks.stream=async()=>{controller.abort(new DOMException('deadline','TimeoutError'));throw new DOMException('transport aborted','AbortError');};
 const error=await f.generate('a',{}, {signal:controller.signal}).catch(error=>error);
 assert.equal(f.runtime.errorCode(error),'timeout');assert.equal(f.runtime.cache.size,0);assert.equal(f.runtime.jobs.size,0);
});

test('status describes provider policy and configured budget changes invalidate cached generations',async t=>{const f=fixture(t);const limits=f.runtime.state(f.agents.get('a')).limits;assert.equal(limits.suggestTokens,undefined);assert.equal(limits.enhanceTokens,undefined);assert.equal(limits.suggestFallbackTokens,undefined);assert.equal(limits.enhanceFallbackTokens,undefined);assert.equal(limits.modelBudgetPolicy,'provider-model');let budget=16384;const resolve=f.ctx.llm.resolveModelInfo;f.ctx.llm.resolveModelInfo=async(...args)=>({...await resolve(...args),defaultMaxTokens:budget});await f.generate();budget=32768;assert.notEqual((await f.generate()).cached,true);assert.equal(f.streams.length,2);});

test('deadline during route preflight is also timeout and never reaches a model stream',async t=>{const f=fixture(t),controller=new AbortController();f.hooks.resolve=async()=>{controller.abort(new DOMException('deadline','TimeoutError'));throw new DOMException('transport aborted','AbortError');};const error=await f.generate('a',{}, {signal:controller.signal}).catch(e=>e);assert.equal(f.runtime.errorCode(error),'timeout');assert.equal(f.streams.length,0);assert.equal(f.runtime.jobs.size,0);});

for(const dimension of ['budget','window','effort'])test('captured '+dimension+' change never caches a result under earlier metadata',async t=>{
 const f=fixture(t);f.selections.set('a',{provider:'openai',model:'gpt-test'});
 const resolve=f.ctx.llm.resolveModelInfo,prepare=f.ctx.llm.prepareCall;let changed=true;
 f.ctx.llm.resolveModelInfo=async(...args)=>({...await resolve(...args),defaultMaxTokens:512});
 f.ctx.llm.prepareCall=async(config,signal,configure)=>{
  const snapshot={provider:config.provider,id:config.model,name:config.model,defaultMaxTokens:changed&&dimension==='budget'?16384:512,context:{contextWindow:changed&&dimension==='window'?500000:1000000},reasoning:{defaultEffort:changed&&dimension==='effort'?'xhigh':'high'}};
  const controls=configure?configure(config,snapshot):config;
  const prepared=await prepare({...config,...controls,maxTokens:controls.maxTokens??snapshot.defaultMaxTokens,reasoningEffort:controls.reasoningEffort??snapshot.reasoning.defaultEffort},signal);
  return {...prepared,context:snapshot.context};
 };
 await f.generate();assert.equal(f.runtime.cache.size,0);
 changed=false;assert.notEqual((await f.generate()).cached,true);assert.equal(f.prepares.length,2);
 assert.equal((await f.generate()).cached,true);assert.equal(f.prepares.length,2);
});

test('long draft and complete enhancement follow model context, not former 20K/64K text caps',async t=>{const f=fixture(t),draft='文'.repeat(100000);const result=await f.generate('a',{draft});assert.equal(result.original,draft);assert.equal(result.text,'generated a '+draft);assert.equal(f.streams.length,1);assert.equal(result.contextWindowTokens,1000000);assert.equal(result.outputBudgetTokens,null);assert.equal(f.commandLog.length,0);});
