import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, initialSettings, normalizeConfig } from "../assist/config.js";
import { COMMAND_NAME, PROJECTION_KEY, initialContextState, foldContextState, selectQA, TRUNCATION_MARKER } from "../assist/context.js";

const event = (type, seq, data, extra = {}) => ({ type, seq, time: 0, data, ...extra });
const user = (seq, text = "question", source = "user") => event("user/message", seq, {
  id: `u${seq}`, role: "user", source: { kind: source }, content: [{ type: "text", text }],
}, { surfaceOp: "append" });
const assistant = (seq, turn, text = "answer", extra = {}) => event("assistant/message", seq, {
  turn, step: 1, message: { id: `a${seq}`, role: "assistant", source: { kind: "model", provider: "mock", model: "mock" },
    content: [{ type: "text", text }] }, stream: [], ...extra,
});
const run = (seq, id, feature, config) => event("command/run", seq, {
  commandId: id, name: COMMAND_NAME, args: JSON.stringify({ feature, config }),
});
const done = (seq, id, kind = "success") => event("command/done", seq, { commandId: id, kind });
function complete(state, index, question = `q${index}`, answer = `a${index}`) {
  const seq = index * 10;
  return [user(seq, question), event("turn/start", seq + 1, { turn: index }), assistant(seq + 2, index, answer),
    event("turn/end", seq + 3, { turn: index, reason: { kind: "completed" } })].reduce(foldContextState, state);
}
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test("new session settings are independent, disabled and auxiliary Fast defaults off", () => {
  const a = initialSettings();
  const b = initialContextState({ parentSession: "p", isSeeded: true }, 10);
  assert.deepEqual(a.suggest, DEFAULT_CONFIG);
  assert.notStrictEqual(a.suggest, a.enhance);
  assert.notStrictEqual(a.suggest, b.settings.suggest);
  assert.equal(b.qaId, null); assert.equal(b.qaCount, 0); assert.equal(b.busy, false);
  assert.deepEqual(b.rounds, []); assert.deepEqual(b.pending, {});
  assert.equal(PROJECTION_KEY, "local.promptAssist.v2");
});

test("config validates all QA counts and preserves explicit native effort IDs", () => {
  for (let rounds = 1; rounds <= 20; rounds++) assert.equal(normalizeConfig({ rounds }).rounds, rounds);
  const input = freeze({ followSession: false, enabled: true, provider: "local-route", model: "native-id", reasoningEffort: "xhigh", fast: true, rounds: 3 });
  assert.deepEqual(normalizeConfig(input), input);
  assert.notStrictEqual(normalizeConfig(input), input);
  assert.equal(normalizeConfig({ followSession: true, fast: false }).fast, false);
  assert.equal(normalizeConfig({ followSession: false }).enabled, false);
  assert.throws(() => normalizeConfig({ followSession: false, enabled: true }), { code: "model-required" });
});

test("invalid config fails with simple Error.code instead of coercion or clamp", () => {
  for (const rounds of [0, -1, 21, 1.5, "3", null, undefined, NaN, Infinity]) {
    assert.throws(() => normalizeConfig({ rounds }), { code: "invalid-rounds" });
  }
  for (const value of [null, [], "x", 2]) assert.throws(() => normalizeConfig(value), { code: "invalid-config" });
  for (const [key, value, code] of [
    ["enabled", "false", "invalid-enabled"], ["followSession", 1, "invalid-follow-session"],
    ["fast", 0, "invalid-fast"], ["provider", null, "invalid-provider"], ["provider", " p", "invalid-provider"],
    ["model", "bad\nmodel", "invalid-model"], ["reasoningEffort", [], "invalid-effort"],
    ["reasoningEffort", "x".repeat(257), "invalid-effort"],
  ]) assert.throws(() => normalizeConfig({ [key]: value }), { code });
  assert.throws(() => normalizeConfig({ unknown: true }), { code: "invalid-config" });
});

test("only paired successful own config commands update their feature", () => {
  const initial = freeze(initialContextState({}, 0));
  let state = foldContextState(initial, freeze(run(0, "s", "suggest", { enabled: true, fast: true, rounds: 3 })));
  assert.strictEqual(state.settings, initial.settings);
  state = foldContextState(state, run(1, "e", "enhance", { rounds: 5 }));
  state = foldContextState(state, done(2, "s"));
  assert.equal(state.settings.suggest.enabled, true);
  assert.equal(state.settings.suggest.fast, true);
  assert.strictEqual(state.settings.enhance, initial.settings.enhance);
  state = foldContextState(state, done(3, "e", "error"));
  assert.equal(state.settings.enhance.rounds, 1);
  assert.deepEqual(state.pending, {});
  assert.deepEqual(initial.settings.suggest, DEFAULT_CONFIG);
  assert.strictEqual(foldContextState(state, done(4, "missing")), state);
});

test("malformed commands are ignored and no-op success preserves settings identity", () => {
  const initial = initialContextState({}, 0);
  for (const args of ["not json", "null", "[]", "{}", JSON.stringify({ feature: "other", config: {} }),
    JSON.stringify({ feature: "suggest", config: { rounds: 30 } }), JSON.stringify({ feature: "suggest" })]) {
    assert.strictEqual(foldContextState(initial, event("command/run", 0, { name: COMMAND_NAME, commandId: "x", args })), initial);
  }
  assert.strictEqual(foldContextState(initial, event("command/run", 1, { name: "other", commandId: "x", args: "{}" })), initial);
  const pending = foldContextState(initial, run(2, "__proto__", "suggest", {}));
  const finished = foldContextState(pending, done(3, "__proto__"));
  assert.strictEqual(finished.settings, initial.settings);
  assert.deepEqual(finished.pending, {});
});

test("forks retain inherited complete QA but not inherited feature settings or active turn", () => {
  let state = initialContextState({ parentSession: "p" }, 10);
  state = foldContextState(foldContextState(state, run(0, "c", "suggest", { enabled: true })), done(1, "c"));
  state = complete(state, 0);
  assert.equal(state.qaId, "0:3"); assert.equal(state.settings.suggest.enabled, false);
  state = foldContextState(state, event("turn/start", 8, { turn: 5 }));
  assert.equal(state.busy, true);
  state = foldContextState(state, event("session/end-seed", 10, {}));
  assert.equal(state.busy, false); assert.equal(state.question, null); assert.equal(state.inherited, false);
  state = foldContextState(foldContextState(state, run(11, "own", "enhance", { enabled: true })), done(12, "own"));
  assert.equal(state.settings.enhance.enabled, true); assert.equal(state.settings.suggest.enabled, false);
  assert.equal(selectQA(state, 20).length, 1);
});

test("inherited command run can never pair with an own done", () => {
  let state = initialContextState({}, 5);
  state = foldContextState(state, run(4, "cross", "suggest", { enabled: true }));
  state = foldContextState(state, done(5, "cross"));
  assert.equal(state.settings.suggest.enabled, false); assert.deepEqual(state.pending, {});
});

test("ignore system, reasoning, tools and irrelevant stream tokens by exact reference", () => {
  const initial = freeze(initialContextState({}, 0));
  for (const type of ["system/message", "developer/message", "tool/call", "tool/result", "assistant/attempt", "step/start", "request/header"]) {
    assert.strictEqual(foldContextState(initial, event(type, 1, { text: "private content" })), initial);
  }
  let state = foldContextState(initial, user(2));
  state = foldContextState(state, event("turn/start", 3, { turn: 1 }));
  for (let i = 0; i < 10000; i++) assert.strictEqual(foldContextState(state, event("assistant/attempt", i + 4, { stream: [] })), state);
});

test("only real human source questions become QA, not synthetic replacement messages", () => {
  for (const input of [user(0, "tool injected", "tool"),
    { ...user(0, "summary"), sourceEventSeqs: [1] },
    { ...user(0, "replacement"), surfaceOp: { op: "replace", startSeq: 0, endSeq: 1 } }]) {
    let state = initialContextState({}, 0);
    assert.strictEqual(foldContextState(state, input), state);
    state = [event("turn/start", 1, { turn: 1 }), assistant(2, 1),
      event("turn/end", 3, { turn: 1, reason: { kind: "completed" } })].reduce(foldContextState, state);
    assert.deepEqual(state.rounds, []);
  }
});

test("only final non-interrupted assistant text of completed turn is retained", () => {
  let state = [user(0, "Q"), event("turn/start", 1, { turn: 1 })].reduce(foldContextState, initialContextState({}, 0));
  const settings = state.settings;
  const toolMessage = assistant(2, 1);
  toolMessage.data.message.content.push({ type: "tool-call", id: "tool", name: "read", arguments: "SECRET_TOOL_ARGS" });
  state = foldContextState(state, toolMessage);
  assert.equal(state.answer, null);
  const final = assistant(4, 1, "final");
  final.data.message.content.unshift({ type: "reasoning", text: "SECRET_REASONING" });
  final.data.message.content.push({ type: "text", text: "detail" });
  state = foldContextState(state, final);
  assert.equal(state.qaId, null); assert.equal(state.busy, true);
  state = foldContextState(state, event("turn/end", 5, { turn: 1, reason: { kind: "completed" } }));
  assert.equal(state.busy, false); assert.equal(state.qaId, "0:5"); assert.equal(state.qaCount, 1);
  assert.equal(state.rounds[0].answer, "final\ndetail"); assert.equal(state.rounds[0].question, "Q");
  assert.doesNotMatch(JSON.stringify(state.rounds), /SECRET/);
  assert.strictEqual(state.settings, settings);
});

test("incomplete, interrupted and non-completed turns never form pairs", () => {
  for (const kind of ["aborted", "blocked", "error", "max-tokens", "interrupted", "forked"]) {
    const state = [user(0), event("turn/start", 1, { turn: 1 }), assistant(2, 1),
      event("turn/end", 3, { turn: 1, reason: { kind } })].reduce(foldContextState, initialContextState({}, 0));
    assert.equal(state.busy, false); assert.deepEqual(state.rounds, []);
  }
  for (const extra of [{ interrupted: true }, { message: { role: "assistant", source: { kind: "model" }, content: [{ type: "reasoning", text: "hidden" }] } }]) {
    const state = [user(0), event("turn/start", 1, { turn: 1 }), assistant(2, 1, "text", extra),
      event("turn/end", 3, { turn: 1, reason: { kind: "completed" } })].reduce(foldContextState, initialContextState({}, 0));
    assert.deepEqual(state.rounds, []);
  }
});

test("later completed autonomous answer replaces the same question instead of inventing QA", () => {
  let state = complete(initialContextState({}, 0), 0);
  state = [event("turn/start", 10, { turn: 1 }), assistant(11, 1, "updated answer"),
    event("turn/end", 12, { turn: 1, reason: { kind: "completed" } })].reduce(foldContextState, state);
  assert.equal(state.qaCount, 1); assert.equal(state.qaId, "0:12");
  assert.equal(state.rounds[0].answer, "updated answer");
  state = complete(state, 2); assert.equal(state.qaCount, 2);
  assert.deepEqual(state.rounds.map(round => round.questionSeq), [0, 20]);
});

test("retain at most 20 unique questions and select detached recent pairs", () => {
  let state = initialContextState({}, 0);
  for (let i = 0; i < 25; i++) state = complete(state, i);
  assert.equal(state.qaCount, 20); assert.equal(state.rounds[0].question, "q5");
  const selected = selectQA(state, 3);
  assert.deepEqual(selected.map(round => round.question), ["q22", "q23", "q24"]);
  selected[0].question = "mutated"; assert.equal(state.rounds.at(-3).question, "q22");
  const end = event("turn/end", 244, { turn: 24, reason: { kind: "completed" } });
  assert.strictEqual(foldContextState(state, end), state);
  for (const count of [0, 21, "3", NaN, 1.5]) assert.throws(() => selectQA(state, count), { code: "invalid-rounds" });
});

test("long Chinese multi-block QA is preserved completely, including literal legacy marker text", () => {
  const qParts = ["中文问题🙂".repeat(5000), "正文引用" + TRUNCATION_MARKER, "问题末尾不可丢失".repeat(3000)];
  const aParts = ["完整回答🧪".repeat(6000), "答案末尾不可丢失".repeat(3000)];
  const question = user(0), answer = assistant(2, 1);
  question.data.content = [...qParts.map(text => ({type: "text", text})), {type: "image", text: "HIDDEN_IMAGE"}];
  answer.data.message.content = [{type: "reasoning", text: "HIDDEN_REASONING"}, ...aParts.map(text => ({type: "text", text}))];
  const state = [question, event("turn/start", 1, {turn: 1}), answer,
    event("turn/end", 3, {turn: 1, reason: {kind: "completed"}})].reduce(foldContextState, initialContextState({}, 0));
  assert.equal(state.rounds[0].truncated, false);
  const selected = selectQA(state, 1);
  assert.equal(selected[0].question, qParts.join("\n"));
  assert.equal(selected[0].answer, aParts.join("\n"));
  assert.doesNotMatch(JSON.stringify(selected), /HIDDEN_IMAGE|HIDDEN_REASONING/);
  assert.deepEqual(selectQA(JSON.parse(JSON.stringify(state)), 1), selected);
});

test("plain JSON checkpoint preserves pending command and incomplete QA semantics", () => {
  let state = [user(0), event("turn/start", 1, { turn: 1 }), run(2, "save", "suggest", { rounds: 5 })]
    .reduce(foldContextState, initialContextState({}, 0));
  const restored = JSON.parse(JSON.stringify(state));
  const tail = [done(3, "save"), assistant(4, 1), event("turn/end", 5, { turn: 1, reason: { kind: "completed" } })];
  assert.deepEqual(tail.reduce(foldContextState, restored), tail.reduce(foldContextState, state));
  assert.throws(() => initialContextState({}, -1), { code: "invalid-context-floor" });
});

test("a later tool event invalidates intermediate assistant text even without a tool block", () => {
  for (const type of ["tool/call", "tool/result"]) {
    let state = [user(0), event("turn/start", 1, { turn: 1 }), assistant(2, 1, "intermediate")]
      .reduce(foldContextState, initialContextState({}, 0));
    assert.strictEqual(foldContextState(state, event(type, 3, { turn: 2 })), state);
    state = foldContextState(state, event(type, 3, { turn: 1 }));
    assert.equal(state.answer, null);
    state = foldContextState(state, event("turn/end", 4, { turn: 1, reason: { kind: "completed" } }));
    assert.deepEqual(state.rounds, []);
  }
});

test("a newly queued human question cannot pair with the earlier answer in the same turn", () => {
  const state = [user(0, "old"), event("turn/start", 1, { turn: 1 }), assistant(2, 1, "old answer"),
    user(3, "new"), event("turn/end", 4, { turn: 1, reason: { kind: "completed" } })]
    .reduce(foldContextState, initialContextState({}, 0));
  assert.deepEqual(state.rounds, []); assert.equal(state.question.text, "new");
});

test("unsettled config commands are bounded and duplicate IDs cannot overwrite a pending value", () => {
  let state = initialContextState({}, 0);
  for (let i = 0; i < 64; i++) state = foldContextState(state, run(i, `c${i}`, "suggest", { rounds: 3 }));
  assert.equal(Object.keys(state.pending).length, 64);
  assert.strictEqual(foldContextState(state, run(64, "extra", "suggest", { rounds: 5 })), state);
  assert.strictEqual(foldContextState(state, run(65, "c0", "suggest", { rounds: 9 })), state);
  state = foldContextState(state, done(66, "c0"));
  assert.equal(state.settings.suggest.rounds, 3); assert.equal(Object.keys(state.pending).length, 63);
});

test("selected malformed or explicitly truncated legacy checkpoint content is rejected before model use", () => {
  assert.throws(() => selectQA({ rounds: [{ question: "Q", answer: "" }] }, 1), { code: "invalid-context" });
  assert.throws(() => selectQA({ rounds: [{ question: "Q", answer: "retained prefix" + TRUNCATION_MARKER, truncated: true }] }, 1), { code: "context-overflow" });
});

test("legacy truncation is rejected by its flag, not by literal marker content", () => {
  const text = "A quoted historical marker:" + TRUNCATION_MARKER;
  assert.equal(selectQA({rounds: [{question: text, answer: text, truncated: false}]}, 1)[0].answer, text);
  for (const answer of ["retained prefix", "retained prefix" + TRUNCATION_MARKER]) {
    const state = {rounds: [{question: "old", answer, truncated: true}, {question: "new", answer: "complete", truncated: false}]};
    assert.equal(selectQA(state, 1)[0].question, "new");
    assert.throws(() => selectQA(state, 2), {code: "context-overflow"});
  }
});
