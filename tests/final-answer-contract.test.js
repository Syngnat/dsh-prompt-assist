import test from 'node:test';
import assert from 'node:assert/strict';
import {installFinalAnswerContract, FINAL_ANSWER_REMINDER, FINAL_ANSWER_SOURCE} from '../assist/final-answer-contract.js';

/** Minimal cordis-shaped context: records waterfall listeners and emits session events by hand. */
function fakeCtx() {
  const hooks = new Map();
  const ctx = {
    on(name, handler, options) {
      if (!hooks.has(name)) hooks.set(name, []);
      hooks.get(name).push({handler, options});
      return () => { const list = hooks.get(name); const at = list.findIndex(item => item.handler === handler); if (at >= 0) list.splice(at, 1); };
    },
  };
  const emitSession = (session, event) => { for (const item of [...(hooks.get('session/event') ?? [])]) item.handler(session, event); };
  const preStep = async (payload) => {
    const list = hooks.get('agent/pre-step') ?? [];
    const run = index => async () => {
      if (index >= list.length) return payload.decision;
      return list[index].handler(payload, run(index + 1));
    };
    return run(0)();
  };
  return {ctx, hooks, preStep, emitSession};
}

const userMessage = text => ({id: 'm-' + text, role: 'user', content: [{type: 'text', text}], source: {kind: 'user'}});
const enter = messages => ({kind: 'enter', messages});
const session = {id: 'session-1'};
const payload = (decision, target = session) => ({agent: {session: target, sessionId: target.id}, messages: [], step: 1, signal: {aborted: false}, decision});

test('the reminder carries the contract verbatim', () => {
  assert.ok(FINAL_ANSWER_REMINDER.startsWith('<system-reminder>\n'));
  assert.ok(FINAL_ANSWER_REMINDER.endsWith('\n</system-reminder>'));
  assert.match(FINAL_ANSWER_REMINDER, /Final Answer Contract: 任务完成后的最后一条消息只给结论，不复述过程。/);
  assert.match(FINAL_ANSWER_REMINDER, /默认不超过 10 行；要点 4–6 条、按重要性排序、一行一条、禁止嵌套/);
  assert.match(FINAL_ANSWER_REMINDER, /结尾最多 1–3 个编号的下一步/);
  assert.match(FINAL_ANSWER_REMINDER, /执行期间的进度说明压到一句、8–10 词/);
});

test('a rejected step passes through untouched', async () => {
  const {ctx, preStep} = fakeCtx();
  installFinalAnswerContract(ctx, {});
  const rejected = {kind: 'reject'};
  assert.equal(await preStep(payload(rejected)), rejected);
});

test('an admitted step gets exactly one reminder per session', async () => {
  const {ctx, preStep} = fakeCtx();
  installFinalAnswerContract(ctx, {});
  const first = await preStep(payload(enter([userMessage('hello')])));
  assert.equal(first.kind, 'enter');
  assert.equal(first.messages.length, 2);
  const injected = first.messages.at(-1);
  assert.equal(injected.role, 'user');
  assert.deepEqual(injected.source, FINAL_ANSWER_SOURCE);
  assert.equal(typeof injected.id, 'string');
  assert.ok(injected.id.length > 0);
  assert.equal(injected.content[0].type, 'text');
  assert.equal(injected.content[0].text, FINAL_ANSWER_REMINDER);
  // A second step in the same session must not double the reminder.
  const second = await preStep(payload(enter([userMessage('again')])));
  assert.equal(second.messages.length, 1);
  // Another session still gets its own copy.
  const other = await preStep(payload(enter([userMessage('other')]), {id: 'session-2'}));
  assert.equal(other.messages.length, 2);
});

test('a compaction drops the marker so the contract is re-injected', async () => {
  const {ctx, preStep, emitSession} = fakeCtx();
  installFinalAnswerContract(ctx, {});
  assert.equal((await preStep(payload(enter([userMessage('one')])))).messages.length, 2);
  emitSession(session, {type: 'compaction/start'});
  assert.equal((await preStep(payload(enter([userMessage('two')])))).messages.length, 1);
  emitSession(session, {type: 'compaction/end'});
  const afterCompaction = await preStep(payload(enter([userMessage('three')])));
  assert.equal(afterCompaction.messages.length, 2);
  assert.equal(afterCompaction.messages.at(-1).content[0].text, FINAL_ANSWER_REMINDER);
});

test('an empty decision is left alone and a disabled switch never injects', async () => {
  const {ctx, preStep} = fakeCtx();
  const dispose = installFinalAnswerContract(ctx, {});
  const empty = enter([]);
  assert.deepEqual(await preStep(payload(empty)), empty);
  dispose();
  assert.equal((await preStep(payload(enter([userMessage('x')])))).messages.length, 1);

  const off = fakeCtx();
  installFinalAnswerContract(off.ctx, {enabled: false});
  assert.equal((await off.preStep(payload(enter([userMessage('y')])))).messages.length, 1);
  const live = fakeCtx();
  let enabled = false;
  installFinalAnswerContract(live.ctx, {enabled: () => enabled});
  assert.equal((await live.preStep(payload(enter([userMessage('z')])))).messages.length, 1);
  enabled = true;
  assert.equal((await live.preStep(payload(enter([userMessage('z')])))).messages.length, 2);
});
