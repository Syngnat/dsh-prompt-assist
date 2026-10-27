import test from 'node:test';
import assert from 'node:assert/strict';
import {
  installFinalAnswerContract, buildContractReminder,
  FINAL_ANSWER_REMINDER, FINAL_ANSWER_SOURCE, PROCESS_FEEDBACK_REMINDER, FULL_CONTRACT_REMINDER,
} from '../assist/final-answer-contract.js';

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

test('the process reminder states the narration rules explicitly', () => {
  assert.ok(PROCESS_FEEDBACK_REMINDER.startsWith('<system-reminder>\n'));
  assert.ok(PROCESS_FEEDBACK_REMINDER.endsWith('\n</system-reminder>'));
  assert.match(PROCESS_FEEDBACK_REMINDER, /过程反馈契约（硬性要求）/);
  assert.match(PROCESS_FEEDBACK_REMINDER, /只要这一轮要调用工具，就必须在调用前先输出一句面向用户的进度说明/);
  assert.match(PROCESS_FEEDBACK_REMINDER, /禁止只给工具调用而没有文字/);
  assert.match(PROCESS_FEEDBACK_REMINDER, /不要连续两次工具调用之间没有文字/);
  assert.match(PROCESS_FEEDBACK_REMINDER, /不调用工具的最后一轮不要写进度说明/);
  assert.doesNotMatch(PROCESS_FEEDBACK_REMINDER, /Final Answer Contract/);
});

test('both switches compose one reminder and neither section disappears', () => {
  assert.equal(buildContractReminder({finalAnswer: false, processFeedback: false}), '');
  assert.match(FULL_CONTRACT_REMINDER, /Final Answer Contract/);
  assert.match(FULL_CONTRACT_REMINDER, /过程反馈契约/);
  assert.ok(FULL_CONTRACT_REMINDER.indexOf('Final Answer Contract') < FULL_CONTRACT_REMINDER.indexOf('过程反馈契约'));
  assert.equal(buildContractReminder({finalAnswer: true, processFeedback: true}), FULL_CONTRACT_REMINDER);
});

test('turning process feedback on mid-session appends only the missing section', async () => {
  const {ctx, preStep} = fakeCtx();
  let process = false;
  installFinalAnswerContract(ctx, {processEnabled: () => process});
  const first = await preStep(payload(enter([userMessage('hello')])));
  assert.equal(first.messages.at(-1).content[0].text, FINAL_ANSWER_REMINDER);
  process = true;
  const second = await preStep(payload(enter([userMessage('again')])));
  assert.equal(second.messages.length, 2);
  assert.equal(second.messages.at(-1).content[0].text, PROCESS_FEEDBACK_REMINDER);
  assert.equal((await preStep(payload(enter([userMessage('third')])))).messages.length, 1);
});

test('turning a switch off appends nothing, and re-enabling a section already sent stays quiet', async () => {
  const {ctx, preStep} = fakeCtx();
  let final = true, process = true;
  installFinalAnswerContract(ctx, {enabled: () => final, processEnabled: () => process});
  const first = await preStep(payload(enter([userMessage('hello')])));
  assert.equal(first.messages.at(-1).content[0].text, FULL_CONTRACT_REMINDER);
  process = false;
  assert.equal((await preStep(payload(enter([userMessage('off')])))).messages.length, 1);
  final = false;
  assert.equal((await preStep(payload(enter([userMessage('both-off')])))).messages.length, 1);
  process = true;
  assert.equal((await preStep(payload(enter([userMessage('on')])))).messages.length, 1);
  final = true;
  assert.equal((await preStep(payload(enter([userMessage('final')])))).messages.length, 1);
  // A different session starts with both off and receives only what it enables later.
  const other = {id: 'session-2'};
  final = false; process = false;
  assert.equal((await preStep(payload(enter([userMessage('none')]), other))).messages.length, 1);
  process = true;
  const again = await preStep(payload(enter([userMessage('process')]), other));
  assert.equal(again.messages.at(-1).content[0].text, PROCESS_FEEDBACK_REMINDER);
});

test('a compaction re-injects the current combined contract', async () => {
  const {ctx, preStep, emitSession} = fakeCtx();
  installFinalAnswerContract(ctx, {processEnabled: true});
  assert.equal((await preStep(payload(enter([userMessage('one')])))).messages.at(-1).content[0].text, FULL_CONTRACT_REMINDER);
  emitSession(session, {type: 'compaction/end'});
  assert.equal((await preStep(payload(enter([userMessage('two')])))).messages.at(-1).content[0].text, FULL_CONTRACT_REMINDER);
});
