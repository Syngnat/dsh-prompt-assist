import test from "node:test";
import assert from "node:assert/strict";
import * as api from "../assist/client/api.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Preview, NoSuggestion } from "../assist/client/preview.js";
import { dictionaries } from "../assist/client/messages.js";

for (const [code, key] of [["fast-unsupported", "fastUnsupported"], ["empty-result", "emptyResult"], ["cancelled", "cancelled"], ["model-failed", "modelFailed"]]) {
  test(code + " receives its specific user-facing failure message", () => {
    assert.equal(api.errorKey({ code }), key);
  });
}
test("unknown codes still use the generic request fallback", () => {
  assert.equal(api.errorKey({ code: "upstream-odd" }), "requestError");
});

test("safeCode permits only bounded lowercase ASCII diagnostic codes", () => {
  for (const code of ["upstream-odd", "1", "a".repeat(64)]) assert.equal(api.safeCode({ code }), code);
  for (const code of ["", "a".repeat(65), "UPSTREAM", "bad_code", "bad code", "bad\n", "bad\r", "bad\u2028", "路径", "<script>", "a/b", "a?b", null, undefined, 12, {}, Symbol("secret")]) {
    assert.equal(api.safeCode({ code }), "unknown");
  }
  assert.equal(api.safeCode(null), "unknown"); assert.equal(api.safeCode(undefined), "unknown");
});

test("the shared generic error formatter displays only a safe short code, never provider detail", () => {
  const t = key => ({ requestError: "Request failed.", safeCodeLabel: "Safe error code", emptyResult: "No usable text." }[key] ?? key);
  assert.equal(api.errorText({ code: "upstream-odd", message: "RAW_SECRET_PROVIDER_DETAIL" }, t), "Request failed. Safe error code upstream-odd");
  assert.equal(api.errorText({ code: "<unsafe>\nDETAIL", message: "RAW_SECRET" }, t), "Request failed. Safe error code unknown");
  assert.equal(api.errorText({ code: "empty-result", message: "RAW_SECRET" }, t), "No usable text.");
});

test("generic diagnostics do not coerce an invalid object code into provider text", () => {
  const code = { toString() { throw new Error("RAW_SECRET_STRINGIFICATION"); } };
  assert.equal(api.errorText({ code }, key => key), "requestError safeCodeLabel unknown");
});

function previewFixture(changes = {}) {
  const value = { sessionId: "a", feature: "enhance", original: "draft", text: "Enhanced draft", fastSkipped: true,
    snapshot: { original: "draft", draftRev: 1, structured: false }, ...changes };
  const runtime = { sessionId: "a", result: { preview: value }, allowed: true, busy: false, dirty: false, controller: { dismiss() {}, cancel() {} } };
  return renderToStaticMarkup(React.createElement(Preview, { runtime, actions: {}, t: key => key, onApplied() {} }));
}

test("Fast skip is a non-blocking preview note and never disables Apply", () => {
  const html = previewFixture();
  assert.match(html, /class="lpa-note"[^>]*>fastSkipped/);
  const button = html.match(/<button[^>]*>apply<\/button>/)?.[0]; assert.ok(button); assert.doesNotMatch(button, /disabled/);
});

test("no-suggestion outcomes also explain a skipped auxiliary Fast request", () => {
  const runtime = { sessionId: "a", result: { noSuggestion: { sessionId: "a", feature: "suggest", outcome: "no-suggestion", text: "", fastSkipped: true } }, controller: { dismiss() {} } };
  const html = renderToStaticMarkup(React.createElement(NoSuggestion, { runtime, t: key => key }));
  assert.match(html, /fastSkipped/); assert.doesNotMatch(html, />apply<|>accept</);
});

test("ordinary results do not claim Fast was skipped", () => {
  assert.doesNotMatch(previewFixture({ fastSkipped: false }), /fastSkipped/);
});

test("the Fast skip note never relaxes streaming or structured-input Apply guards", () => {
  for (const changes of [{ streaming: true }, { snapshot: { structured: true } }]) {
    const html = previewFixture(changes);
    const button = html.match(/<button[^>]*>apply<\/button>/)?.[0]; assert.ok(button); assert.match(button, /disabled/);
    assert.match(html, /fastSkipped/);
  }
});

test("both languages provide specific failures and readable safe-code fallback diagnostics", () => {
  for (const language of ["en", "zh"]) {
    const t = key => dictionaries[language][key];
    for (const code of ["fast-unsupported", "empty-result", "cancelled", "model-failed"]) {
      const value = api.errorText({ code }, t); assert.equal(typeof value, "string"); assert.ok(value.length);
      assert.notEqual(value, t("requestError"));
    }
    assert.equal(api.errorText({ code: "opaque-cause" }, t), t("requestError") + " " + t("safeCodeLabel") + " opaque-cause");
  }
});

test("string protocol codes are diagnosed; the camelCase requestError notice intentionally has code unknown", () => {
  const t = key => ({ requestError: "Request failed.", safeCodeLabel: "Safe error code", emptyResult: "No usable text." }[key] ?? key);
  assert.equal(api.errorText("requestError", t), "Request failed. Safe error code unknown");
  assert.equal(api.safeCode("requestError"), "unknown", "an internal i18n key is not a lowercase protocol code");
  assert.equal(api.errorText("upstream-odd", t), "Request failed. Safe error code upstream-odd");
  assert.equal(api.safeCode("upstream-odd"), "upstream-odd");
  assert.equal(api.errorText("empty-result", t), "No usable text.");
});
