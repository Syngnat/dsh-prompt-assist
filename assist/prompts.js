import { SUGGEST_ROLE_PROMPT } from './suggest-role.js';
import { ENHANCE_ROLE_PROMPT } from './enhance-role.js';
import { QA_ROUND_LIMIT, QA_TEXT_LIMIT, TRUNCATION_MARKER } from "./context.js";
import { FILE_BYTES, TOTAL_BYTES } from "./files.js";

function failure(code) { return Object.assign(new Error(code), { code }); }

function qaData(qa) {
  if (!Array.isArray(qa) || qa.length > QA_ROUND_LIMIT) throw failure("invalid-context");
  return qa.map(round => {
    if (!round || typeof round.question !== "string" || typeof round.answer !== "string"
      || !round.question.trim() || !round.answer.trim()) throw failure("invalid-context");
    if (round.truncated || round.question.length > QA_TEXT_LIMIT || round.answer.length > QA_TEXT_LIMIT
      || round.question.includes(TRUNCATION_MARKER) || round.answer.includes(TRUNCATION_MARKER)) throw failure("context-overflow");
    return { question: round.question, answer: round.answer };
  });
}

function fileData(files) {
  if (!Array.isArray(files)) throw failure("invalid-file-entry");
  let total = 0;
  return files.map(file => {
    if (!file || typeof file.name !== "string" || !file.name || typeof file.text !== "string"
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw failure("invalid-file-entry");
    if (file.text.length > FILE_BYTES) throw failure("file-too-large");
    const textBytes = new TextEncoder().encode(file.text).byteLength;
    if (file.bytes > FILE_BYTES || textBytes > FILE_BYTES) throw failure("file-too-large");
    if (textBytes > file.bytes) throw failure("invalid-file-bytes");
    total += file.bytes;
    if (total > TOTAL_BYTES) throw failure("files-too-large");
    return { name: file.name, text: file.text };
  });
}

function referenceData(references) {
  if (!Array.isArray(references)) throw failure("invalid-reference");
  return references.map(reference => {
    const name = typeof reference === "string" ? reference
      : reference?.name ?? reference?.displayName ?? reference?.label ?? reference?.title;
    if (typeof name !== "string" || !name.trim() || name.length > 1024
      || /[\u0000-\u001f\u007f]/u.test(name)) throw failure("invalid-reference");
    return { name };
  });
}

/** Build a drafting-only request. Data never gains instruction authority or hidden paths. */
export function buildAssistPrompt(feature, draft, qa = [], files = [], references = []) {
  if (feature !== "suggest" && feature !== "enhance") throw failure("invalid-feature");
  if (typeof draft !== "string") throw failure("invalid-draft");
  if (feature === "enhance" && !draft.trim()) throw failure("empty-draft");
  const data = { feature, draft, qa: qaData(qa), files: fileData(files), references: referenceData(references) };
  if (feature === "enhance") return { system: ENHANCE_ROLE_PROMPT, user: JSON.stringify(data) };
  return { system: SUGGEST_ROLE_PROMPT, user: JSON.stringify(data) };

}
