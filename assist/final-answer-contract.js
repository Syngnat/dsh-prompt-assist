const FINAL_ANSWER_CONTRACT = [
  '- Final Answer Contract: 任务完成后的最后一条消息只给结论，不复述过程。默认不超过 10 行；要点 4–6 条、按重要性排序、一行一条、禁止嵌套；不加"总结/完成情况/小结"这类小标题，不从"总结"二字起笔；不重贴已写过的文件内容，只给 `路径:行号`；结尾最多 1–3 个编号的下一步；单个动作或单次回答直接用一句话，不上结构。',
  '- 过程与结论分流：执行期间的进度说明压到一句、8–10 词，只说明"下一步做什么"；结论在最后一条消息一次性给出，中途不预告结论、结尾不重复。',
].join('\n');

/**
 * Codex-style progress narration. The weak "压到一句" line above is not enough on its own:
 * an A/B against the same route showed the model still emitted tool calls with no text, while
 * these explicit rules produced one user-facing sentence before every tool batch on every turn.
 * Keep the wording concrete (where, when, what) instead of describing a tone.
 */
const PROCESS_FEEDBACK_CONTRACT = [
  '- 过程反馈契约（硬性要求）：',
  '  1. 每次回复中，只要这一轮要调用工具，就必须在调用前先输出一句面向用户的进度说明（约 8–20 个词，使用与用户相同的语言），说明这一步要做什么；禁止只给工具调用而没有文字。',
  '  2. 每个工具结果返回后，先用一句话说明看到了什么或下一步做什么，再发起下一次工具调用；不要连续两次工具调用之间没有文字。',
  '  3. 进度说明只讲下一步动作或刚发现的事实，不预告结论，不写长段落，不列清单。',
  '  4. 不调用工具的最后一轮不要写进度说明，直接给结论、不复述过程；不要用进度说明代替结论。',
].join('\n');

/** Compose the reminder from independent switches; empty when both are off. */
export function buildContractReminder({ finalAnswer = true, processFeedback = false } = {}) {
  const sections = [];
  if (finalAnswer !== false) sections.push(FINAL_ANSWER_CONTRACT);
  if (processFeedback === true) sections.push(PROCESS_FEEDBACK_CONTRACT);
  if (sections.length === 0) return '';
  return '<system-reminder>\n' + sections.join('\n') + '\n</system-reminder>';
}

/** Final-answer-only reminder; kept byte-stable so existing tests can assert it verbatim. */
export const FINAL_ANSWER_REMINDER = buildContractReminder({ finalAnswer: true, processFeedback: false });
export const PROCESS_FEEDBACK_REMINDER = buildContractReminder({ finalAnswer: false, processFeedback: true });
export const FULL_CONTRACT_REMINDER = buildContractReminder({ finalAnswer: true, processFeedback: true });
export const FINAL_ANSWER_SOURCE = Object.freeze({ kind: 'dsh-prompt-assist' });

/** Profile-level switch; anything other than an explicit false keeps the contract on. */
export const isContractEnabled = value => value !== false;

function asEnabled(value, fallback) {
  const resolved = typeof value === 'function' ? value() : value;
  return resolved === undefined ? fallback : resolved !== false;
}

function buildReminder(text, createUserMessage) {
  const content = [{ type: 'text', text }];
  if (typeof createUserMessage === 'function') return createUserMessage({ content, source: { ...FINAL_ANSWER_SOURCE } });
  const id = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : 'final-answer-contract-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  return { id, role: 'user', content, source: { ...FINAL_ANSWER_SOURCE } };
}

/**
 * Append the output contracts to the messages entering a step.
 *
 * The reminder is injected once per session/signature. The signature records which sections the
 * model has already received, so turning a switch on mid-session appends the new section at the
 * next step instead of waiting for a new session; turning one off cannot retract text already in
 * the derived history. A compaction rewrites that history, so the marker is dropped on
 * `compaction/end` and the current contract is injected again on the next step.
 *
 * Liangshen's minimal prompt keeps a hardcoded allowlist of system-prompt sections, so a registered
 * section (and personaSuffix) never reaches the model; the only channel left is the pre-step
 * decision's own message list.
 */
export function installFinalAnswerContract(ctx, { enabled = true, processEnabled = false, createUserMessage } = {}) {
  const sent = new WeakMap();
  const sentById = new Map();
  const wants = () => {
    const finalAnswer = asEnabled(enabled, true);
    const processFeedback = asEnabled(processEnabled, false);
    return (finalAnswer ? 'f' : '') + (processFeedback ? 'p' : '');
  };
  const sentinel = session => (session && typeof session === 'object' ? sent.get(session) : undefined);
  const remember = (session, id, signature) => {
    if (session && typeof session === 'object') sent.set(session, signature);
    if (typeof id === 'string' && id) sentById.set(id, signature);
  };
  const forget = (session, id) => {
    if (session && typeof session === 'object') sent.delete(session);
    if (typeof id === 'string' && id) sentById.delete(id);
  };
  const offPreStep = ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next();
    // Only an admitted step carries messages; a rejected step must pass through untouched.
    if (!decision || decision.kind !== 'enter' || payload?.signal?.aborted) return decision;
    const wanted = wants();
    if (!wanted) return decision;
    const session = payload?.agent?.session;
    const id = payload?.agent?.sessionId ?? session?.id;
    const previous = sentinel(session) ?? (typeof id === 'string' ? sentById.get(id) : undefined) ?? '';
    // Only send sections this history has not received yet; turning a switch off cannot retract
    // text that is already there, and re-sending the other section would only duplicate it.
    const missing = wanted.split('').filter(letter => !previous.includes(letter));
    if (missing.length === 0) return decision;
    // The loop admits an empty decision for a skipped first step; adding the reminder there would
    // create a step of its own, so wait for messages that are already going out.
    if (decision.messages.length === 0) return decision;
    try {
      const reminder = buildReminder(buildContractReminder({
        finalAnswer: missing.includes('f'), processFeedback: missing.includes('p'),
      }), createUserMessage);
      const nextDecision = { ...decision, messages: [...decision.messages, reminder] };
      const union = ['f', 'p'].filter(letter => previous.includes(letter) || missing.includes(letter)).join('');
      remember(session, id, union);
      return nextDecision;
    } catch (error) {
      forget(session, id);
      throw error;
    }
  }, { prepend: true });
  const offSession = ctx.on('session/event', (session, event) => {
    // Compaction rewrites the derived history, so the previous reminder is gone with it.
    if (event?.type === 'compaction/end') forget(session, session?.id);
  });
  return () => {
    offPreStep?.();
    offSession?.();
  };
}
