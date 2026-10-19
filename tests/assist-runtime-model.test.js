import test from "node:test";
import assert from "node:assert/strict";
import { callAssistModel as callNativeAssistModel, resolveAssistRoute } from "../assist/model-call.js";
import { installFastBridge } from "../bridge-v2.js";
import { priorityOverride } from "../assist/priority-scope.js";

const callAssistModel = (ctx, agent, route, prompt, feature, signal) => callNativeAssistModel({...ctx,tokenMeter:{estimateMessage:m=>Math.ceil(m.content[0].text.length/4)+8}}, agent, route, prompt, feature, signal, value => ({ ...value, role: "user", id: "fixture-message",fixtureFeature:feature }));
const prompt = Object.freeze({ system: "draft only", user: "explicit context" });
const agent = Object.freeze({ id: "root-a" });
const capabilities = () => ({ context: { contextWindow: 1000000 },
  reasoning: { efforts: ["low", "medium", "high", "xhigh", "max"].map(id => ({ id, name: id })), defaultEffort: "medium" } });

/** Offline adapter/SDK seam, shaped after inspected Native prepareCall. No provider I/O. */
function wireFixture(mainEnabled, api = "openai-responses", selection = {provider: "openai", model: "gpt-test"}, providers = ["openai"]) {
  const payloads = [], prepared = [], observations = [], originalBodies = [];
  const metadata = capabilities();
  let nativeEfforts = metadata.reasoning.efforts.map(item => item.id);
  const nativeRejection = Object.assign(new Error("native capability changed"), { code: "NATIVE_EFFORT_REJECTED" });
  const model = Object.freeze({ api, provider: selection.provider, id: selection.model });
  const models = Object.freeze({
    async streamSimple(actualModel, messages, options) {
      await Promise.resolve();
      const reasoning = Object.freeze({ effort: options.reasoningEffort });
      const body = Object.freeze({ model: actualModel.id, input: messages,
        ...(api === "openai-completions" ? { reasoning_effort: options.reasoningEffort } : { reasoning }) });
      originalBodies.push(body);
      const actual = options.onPayload ? await options.onPayload(body, actualModel) : body;
      payloads.push({ sessionId: options.sessionId, body: actual }); return actual;
    },
  });
  const snapshot = Object.freeze({ model, models });
  class Adapter {
    modelOf() { return model; }
    async *streamWithSnapshot(options, snapshot) {
      await Promise.resolve();
      await snapshot.models.streamSimple(snapshot.model, options.messages, {
        sessionId: options.sessionId, reasoningEffort: options.reasoningEffort, signal: options.signal,
      });
      yield { type: "text-delta", index: 0, text: options.messages[0]?.fixtureFeature === "suggest" ? JSON.stringify({kind:"suggestion",text:"generated prompt"}) : " generated prompt " };
      yield { type: "finish", reason: { kind: "stop" } };
    }
  }
  const adapter = new Adapter();
  const dispose = installFastBridge(Adapter, id => typeof mainEnabled === "function" ? mainEnabled(id) : mainEnabled, providers);
  const ctx = { llm: {
    async resolveModelInfo() { return structuredClone(metadata); },
    async prepareCall(config, signal) {
      signal?.throwIfAborted(); prepared.push({ ...config });
      if (config.reasoningEffort && !nativeEfforts.includes(config.reasoningEffort)) throw nativeRejection;
      const resolved = Object.freeze({ ...config, reasoningEffort: config.reasoningEffort ?? metadata.reasoning.defaultEffort });
      return { config: resolved, context: metadata.context, async *stream(options) {
        // Admission is deliberately deferred until iteration, proving the whole generator stays scoped.
        await Promise.resolve(); observations.push(priorityOverride(options.sessionId));
        yield* adapter.streamWithSnapshot(options, snapshot);
        await Promise.resolve(); observations.push(priorityOverride(options.sessionId));
      } };
    },
  } };
  return { ctx, metadata, model, snapshot, adapter, payloads, prepared, observations, originalBodies, dispose, nativeRejection,
    setNativeEfforts: value => { nativeEfforts = value; } };
}

test("auxiliary on/off overrides opposite main Fast and preserves actual reasoning payload fields", async t => {
  for (const [fast, api, effort] of [[true, "openai-responses", "xhigh"], [false, "openai-completions", "max"]]) {
    const f = wireFixture(!fast, api);
    try {
      const result = await callAssistModel(f.ctx, agent, { provider: "openai", model: "gpt-test", fast, reasoningEffort: effort, metadata: f.metadata }, prompt, "enhance");
      const body = f.payloads[0].body;
      assert.equal(body.service_tier, fast ? "priority" : undefined);
      assert.equal(api === "openai-completions" ? body.reasoning_effort : body.reasoning.effort, effort);
      assert.equal(f.prepared[0].reasoningEffort, effort); assert.equal(f.prepared[0].maxTokens, undefined);
      assert.equal(f.originalBodies[0].service_tier, undefined);
      assert.deepEqual(f.observations, [fast, fast]); assert.equal(priorityOverride(agent.id), undefined);
      assert.equal(result.text, "generated prompt"); assert.ok(result.timing.ttftMs >= 0);
      for await (const _ of f.adapter.streamWithSnapshot({ provider: "openai", model: "gpt-test", sessionId: agent.id, reasoningEffort: "high", messages: [] }, f.snapshot)) {}
      assert.equal(f.payloads[1].body.service_tier, !fast ? "priority" : undefined);
    } finally { f.dispose(); }
  }
});

for (const model of ["grok-4.6", "grok-4.7", "grok-4.8", "安和桥/grok-4.7"]) {
  for (const [name, fast, authorized] of [["authorized on", true, true], ["authorized off", false, true], ["unapproved on", true, false]]) {
    test(`${model}: auxiliary ${name} applies independently to enhancement and suggestions`, async t => {
      const selection = {provider: "xai", model, reasoningEffort: "high"};
      const providers = authorized ? ["openai", "xai"] : ["openai"];
      const f = wireFixture(!fast, "openai-responses", selection, providers); t.after(f.dispose);
      for (const feature of ["enhance", "suggest"]) {
        const route = await resolveAssistRoute(f.ctx, agent,
          {followSession: feature === "suggest", ...selection, fast}, {selection: () => selection}, providers);
        assert.equal(route.fast, fast && authorized); assert.equal(route.fastSkipped, fast && !authorized);
        const result = await callAssistModel(f.ctx, agent, route, prompt, feature);
        const index = f.payloads.length - 1, body = f.payloads[index].body;
        assert.equal(body.model, model); assert.equal(body.service_tier, fast && authorized ? "priority" : undefined);
        assert.equal(body.reasoning.effort, "high");
        assert.strictEqual(body.input, f.originalBodies[index].input);
        assert.equal(f.originalBodies[index].service_tier, undefined);
        assert.deepEqual(f.prepared[index], {provider: "xai", model, reasoningEffort: "high"});
        assert.equal(result.text, "generated prompt"); assert.equal(priorityOverride(agent.id), undefined);
      }
      assert.deepEqual(f.observations, Array(4).fill(fast && authorized));
      for await (const _ of f.adapter.streamWithSnapshot({...selection, sessionId: agent.id, messages: []}, f.snapshot)) {}
      assert.equal(f.payloads[2].body.service_tier, !fast && authorized ? "priority" : undefined,
        "an auxiliary call must not change the next main-session request");
    });
  }
}

test("concurrent sessions and opposite same-session feature overrides remain isolated", async () => {
  const f = wireFixture(id => id === "root-b");
  try {
    const calls = [["root-a", true, "xhigh"], ["root-b", false, "high"], ["root-a", false, "low"]];
    await Promise.all(calls.map(([id, fast, reasoningEffort]) => callAssistModel(f.ctx, { id },
      { provider: "openai", model: "gpt-test", fast, reasoningEffort, metadata: f.metadata }, prompt, "suggest")));
    assert.equal(f.payloads.length, 3);
    for (const [id, fast, effort] of calls) {
      const payload = f.payloads.find(item => item.sessionId === id && item.body.reasoning.effort === effort);
      assert.equal(payload.body.service_tier, fast ? "priority" : undefined);
    }
    assert.ok(f.prepared.every(config => config.maxTokens === undefined));
    assert.equal(priorityOverride("root-a"), undefined); assert.equal(priorityOverride("root-b"), undefined);
  } finally { f.dispose(); }
});

test("follow-session follows model/effort only; explicit unsupported effort is never clamped", async () => {
  const f = wireFixture(true);
  try {
    const selected = Object.freeze({ provider: "openai", model: "gpt-test", reasoningEffort: "xhigh" });
    const fastService = { selection: () => selected };
    const route = await resolveAssistRoute(f.ctx, agent, { followSession: true, fast: false, reasoningEffort: "low" }, fastService, ["openai"]);
    assert.equal(route.reasoningEffort, "xhigh"); assert.equal(route.fast, false);
    await assert.rejects(resolveAssistRoute(f.ctx, agent, { provider: "openai", model: "gpt-test", reasoningEffort: "ultra", fast: false }, fastService, ["openai"]), { code: "unsupported-effort" });
    assert.equal(f.prepared.length, 0); assert.equal(f.payloads.length, 0);
    f.setNativeEfforts(["high"]);
    await assert.rejects(callAssistModel(f.ctx, agent, route, prompt, "enhance"), error => error === f.nativeRejection);
    assert.equal(f.prepared[0].reasoningEffort, "xhigh"); assert.equal(f.payloads.length, 0);
    f.setNativeEfforts(["medium"]);
    const defaulted = await callAssistModel(f.ctx, agent, { ...route, reasoningEffort: undefined }, prompt, "suggest");
    assert.equal(f.payloads[0].body.reasoning.effort, "medium");
    assert.equal(defaulted.resolvedReasoningEffort, "medium");
  } finally { f.dispose(); }
});

test("overflow rejects before dispatch, and failed/incomplete/output-heavy streams close without scope leak", async () => {
  let prepares = 0, dispatches = 0, closed = 0;
  const ctx = { llm: { async prepareCall(config) { prepares++; return { config, context: {contextWindow:1000000}, async *stream() { dispatches++; } }; } } };
  const route = { provider: "openai", model: "gpt-test", fast: true, metadata: capabilities() };
  await assert.rejects(callAssistModel(ctx, agent, route, { system: "x".repeat(4000000), user: "" }, "enhance"), { code: "context-overflow" });
  assert.equal(prepares, 1); assert.equal(dispatches, 0);
  ctx.llm.prepareCall = async config => ({ config, context: { contextWindow: 16 }, async *stream() { dispatches++; } });
  await assert.rejects(callAssistModel(ctx, agent, route, prompt, "suggest"), { code: "context-overflow" });
  assert.equal(dispatches, 0);
  for (const [chunks, code] of [
    [[], "empty-result"], [[{ type: "text-delta", text: "partial" }], "empty-result"],
    [[{ type: "finish", reason: { kind: "max-tokens" } }], "output-limit"],
    [[{ type: "finish", reason: { kind: "aborted", failure: { message: "RAW_SECRET" } } }], "cancelled"],
    [[{ type: "text-delta", text: "x".repeat(65537) }], "empty-result"],
  ]) {
    ctx.llm.prepareCall = async config => ({ config, context: {contextWindow:1000000}, async *stream() { try { yield* chunks; } finally { closed++; } } });
    await assert.rejects(callAssistModel(ctx, agent, route, prompt, "enhance"), error => error.code === code && !error.message.includes("RAW_SECRET"));
    assert.equal(priorityOverride(agent.id), undefined);
  }
  assert.equal(closed, 5);
});

test("caller cancellation interrupts lazy iteration and runs generator cleanup", async () => {
  const controller = new AbortController(); let closed = false;
  const ctx = { llm: { async prepareCall(config) { return { config, context:{contextWindow:1000000}, async *stream() {
    try { controller.abort(); yield { type: "text-delta", text: "must not escape" }; } finally { closed = true; }
  } }; } } };
  await assert.rejects(callAssistModel(ctx, agent, { provider: "openai", model: "gpt-test", fast: false, metadata: capabilities() }, prompt, "suggest", controller.signal), { name: "AbortError" });
  assert.equal(closed, true); assert.equal(priorityOverride(agent.id), undefined);
});

test("unknown model context budget refuses dispatch instead of guessing a window", async () => {
  let streams=0;
  const ctx={llm:{async prepareCall(config){return {config,stream(){streams+=1;throw Error("must not dispatch");}};}}};
  await assert.rejects(callAssistModel(ctx,agent,{provider:"openai",model:"gpt-test",fast:false,metadata:{}},prompt,"enhance"),{code:"context-unknown"});
  assert.equal(streams,0);
});
