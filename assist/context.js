import { ASSIST_KEY, ASSIST_COMMAND } from './identity.js';
import { initialSettings, normalizeConfig } from "./config.js";

export const PROJECTION_KEY = ASSIST_KEY;
export const COMMAND_NAME = ASSIST_COMMAND;
export const QA_ROUND_LIMIT = 20;
export const QA_TEXT_LIMIT = 16384;
export const TRUNCATION_MARKER = "\n[truncated: prompt-assist context limit]";
const MAX_PENDING_COMMANDS = 64;

function failure(code) { return Object.assign(new Error(code), { code }); }

export function initialContextState(_header, floor = 0) {
  if (!Number.isSafeInteger(floor) || floor < 0) throw failure("invalid-context-floor");
  return {
    settings: initialSettings(), qaId: null, qaCount: 0, busy: false, rounds: [], pending: {},
    floor, inherited: floor > 0, question: null, answer: null, turn: null,
  };
}

/** Retain only text blocks, with an explicit marker rather than silently clipping. */
function messageText(message) {
  if (!Array.isArray(message?.content)) return null;
  let text = "";
  let truncated = false;
  for (const block of message.content) {
    if (block?.type !== "text" || typeof block.text !== "string" || !block.text) continue;
    const separator = text ? "\n" : "";
    const remaining = QA_TEXT_LIMIT - text.length - separator.length;
    if (block.text.length > remaining) {
      text = (text + separator + block.text.slice(0, Math.max(0, remaining))).slice(0, QA_TEXT_LIMIT - TRUNCATION_MARKER.length);
      truncated = true;
      break;
    }
    text += separator + block.text;
  }
  if (truncated) text += TRUNCATION_MARKER;
  return text.trim() ? { text, truncated } : null;
}

function readConfigCommand(data) {
  if (data.name !== COMMAND_NAME || typeof data.args !== "string" || data.args.length > 8192) return null;
  if (typeof data.commandId !== "string" || !data.commandId || data.commandId.length > 256) return null;
  try {
    const value = JSON.parse(data.args);
    if (!value || (value.feature !== "suggest" && value.feature !== "enhance")) return null;
    if (!Object.hasOwn(value, "config")) return null;
    return { feature: value.feature, config: normalizeConfig(value.config) };
  } catch { return null; }
}

function foldCommand(state, event) {
  if (event.seq < state.floor) return state;
  const data = event.data;
  if (event.type === "command/run") {
    const value = readConfigCommand(data);
    if (!value || Object.hasOwn(state.pending, data.commandId)
      || Object.keys(state.pending).length >= MAX_PENDING_COMMANDS) return state;
    return { ...state, pending: { ...state.pending, [data.commandId]: value } };
  }
  if (event.type !== "command/done" || !Object.hasOwn(state.pending, data.commandId)) return state;
  const { feature, config } = state.pending[data.commandId];
  const pending = { ...state.pending };
  delete pending[data.commandId];
  const changed = data.kind === "success"
    && Object.keys(config).some(key => config[key] !== state.settings[feature][key]);
  const settings = changed ? { ...state.settings, [feature]: config } : state.settings;
  return { ...state, settings, pending };
}

function finishTurn(state, event) {
  if (state.turn !== event.data.turn || !state.busy) return state;
  const cleared = { ...state, busy: false, turn: null, answer: null };
  if (event.data.reason?.kind !== "completed" || !state.question || !state.answer) return cleared;
  const round = {
    id: `${state.question.seq}:${event.seq}`, questionSeq: state.question.seq,
    question: state.question.text, answer: state.answer.text, endSeq: event.seq,
    truncated: state.question.truncated || state.answer.truncated,
  };
  const rounds = [...state.rounds.filter(value => value.questionSeq !== round.questionSeq), round].slice(-QA_ROUND_LIMIT);
  return { ...cleared, rounds, qaCount: rounds.length, qaId: round.id };
}

/** Native durable Session events only; stream/tool/system content never becomes QA. */
export function foldContextState(state, event) {
  if (!event || !Number.isSafeInteger(event.seq) || !event.data) return state;
  if (state.inherited && event.seq >= state.floor) {
    state = { ...state, inherited: false, busy: false, turn: null, question: null, answer: null };
  }
  if (event.type === "command/run" || event.type === "command/done") return foldCommand(state, event);
  if (event.type === "user/message") {
    const message = event.data;
    if (message.role !== "user" || message.source?.kind !== "user" || event.sourceEventSeqs?.length) return state;
    if (event.surfaceOp && event.surfaceOp !== "append") return state;
    const question = messageText(message);
    return { ...state, question: question ? { ...question, seq: event.seq } : null, answer: null };
  }
  if (event.type === "turn/start" && Number.isSafeInteger(event.data.turn)) {
    return { ...state, turn: event.data.turn, busy: true, answer: null };
  }
  if (event.type === "turn/end") return finishTurn(state, event);
  if ((event.type === "tool/call" || event.type === "tool/result") && state.busy
    && state.turn === event.data.turn && state.answer) return { ...state, answer: null };
  if (event.type !== "assistant/message" || !state.busy || state.turn !== event.data.turn) return state;
  const message = event.data.message;
  const content = message?.content;
  const valid = !event.data.interrupted && message?.role === "assistant" && message.source?.kind === "model"
    && Array.isArray(content) && !content.some(block => block?.type === "tool-call");
  const answer = valid ? messageText(message) : null;
  if (!answer && !state.answer) return state;
  return { ...state, answer };
}

/** Select complete recent pairs; marked overflow is never admitted to a model prompt. */
export function selectQA(state, count) {
  if (!Number.isInteger(count) || count < 1 || count > QA_ROUND_LIMIT) throw failure("invalid-rounds");
  const rounds = state.rounds.slice(-count);
  if (rounds.some(round => typeof round.question !== "string" || typeof round.answer !== "string"
    || !round.question.trim() || !round.answer.trim())) throw failure("invalid-context");
  if (rounds.some(round => round.question.length > QA_TEXT_LIMIT || round.answer.length > QA_TEXT_LIMIT)) throw failure("context-overflow");
  if (rounds.some(round => round.truncated || round.question.includes(TRUNCATION_MARKER)
    || round.answer.includes(TRUNCATION_MARKER))) throw failure("context-overflow");
  return rounds.map(round => ({ ...round }));
}
