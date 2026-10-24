const CONTRACT = [
  '- Final Answer Contract: 任务完成后的最后一条消息只给结论，不复述过程。默认不超过 10 行；要点 4–6 条、按重要性排序、一行一条、禁止嵌套；不加"总结/完成情况/小结"这类小标题，不从"总结"二字起笔；不重贴已写过的文件内容，只给 `路径:行号`；结尾最多 1–3 个编号的下一步；单个动作或单次回答直接用一句话，不上结构。',
  '- 过程与结论分流：执行期间的进度说明压到一句、8–10 词，只说明"下一步做什么"；结论在最后一条消息一次性给出，中途不预告结论、结尾不重复。',
].join('\n');

/** The reminder text handed to the model; kept byte-stable so tests can assert the contract verbatim. */
export const FINAL_ANSWER_REMINDER = '<system-reminder>\n' + CONTRACT + '\n</system-reminder>';
export const FINAL_ANSWER_SOURCE = Object.freeze({ kind: 'dsh-prompt-assist' });

/** Profile-level switch; anything other than an explicit false keeps the contract on. */
export const isContractEnabled = value => value !== false;

function buildReminder(createUserMessage) {
  const content = [{ type: 'text', text: FINAL_ANSWER_REMINDER }];
  if (typeof createUserMessage === 'function') return createUserMessage({ content, source: { ...FINAL_ANSWER_SOURCE } });
  const id = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : 'final-answer-contract-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  return { id, role: 'user', content, source: { ...FINAL_ANSWER_SOURCE } };
}

/**
 * Append the final-answer contract to the messages entering a step, once per session.
 *
 * Liangshen's minimal prompt keeps a hardcoded allowlist of system-prompt sections, so a registered
 * section (and personaSuffix) never reaches the model; the only channel left is the pre-step
 * decision's own message list. The injected message is a durable user-role reminder: it survives in
 * the derived history, and because a compaction rewrites that history, the marker is dropped on
 * `compaction/end` so the contract is re-injected on the next step.
 */
export function installFinalAnswerContract(ctx, { enabled = true, createUserMessage } = {}) {
  const seenSessions = new WeakMap();
  const seenIds = new Set();
  const allows = () => (typeof enabled === 'function' ? enabled() !== false : enabled !== false);
  const alreadySent = session => (session && typeof session === 'object' ? seenSessions.has(session) : false);
  const remember = (session, id) => {
    if (session && typeof session === 'object') seenSessions.set(session, true);
    if (typeof id === 'string' && id) seenIds.add(id);
  };
  const forget = (session, id) => {
    if (session && typeof session === 'object') seenSessions.delete(session);
    if (typeof id === 'string' && id) seenIds.delete(id);
  };
  const offPreStep = ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next();
    // Only an admitted step carries messages; a rejected step must pass through untouched.
    if (!decision || decision.kind !== 'enter' || payload?.signal?.aborted) return decision;
    if (!allows()) return decision;
    const session = payload?.agent?.session;
    const id = payload?.agent?.sessionId ?? session?.id;
    if (alreadySent(session) || (typeof id === 'string' && seenIds.has(id))) return decision;
    // The loop admits an empty decision for a skipped first step; adding the reminder there would
    // create a step of its own, so wait for messages that are already going out.
    if (decision.messages.length === 0) return decision;
    remember(session, id);
    try {
      return { ...decision, messages: [...decision.messages, buildReminder(createUserMessage)] };
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
