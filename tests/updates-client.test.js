import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dictionaries} from "../assist/client/messages.js";
import {createUpdateController, normalizeUpdateState, safeReleaseUrl, formatCheckedAt,
  initialUpdateSnapshot, updateDisplay, copyInstallSpec, INSTALL_SPEC, UPDATE_ENDPOINT} from "../assist/client/update-state.js";

const require = createRequire(new URL("../package.json", import.meta.url));
const React = require("react");
const {renderToStaticMarkup} = require("react-dom/server");
const {buildSync} = require("esbuild");
function bundle(path) {
  const built = buildSync({entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true,
    write: false, platform: "node", format: "cjs", external: ["react"]});
  const module = {exports: {}};
  new Function("require", "module", "exports", built.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const {UpdatePanelContent, UpdatePanel} = bundle("../assist/client/update-panel.js");
const {SettingsPage} = bundle("../assist/client/settings-page.js");
const stamp = 1792252800000;
const release = "https://github.com/Syngnat/dsh-prompt-assist/releases/tag/v1.2.8";
function data(status = "idle", patch = {}) {
  const checked = ["current", "update-available", "ahead"].includes(status);
  return {currentVersion: status === "ahead" ? "1.3.0-rc.1" : status === "current" ? "1.2.8" : "1.2.7",
    status, latestVersion: checked ? "1.2.8" : null, releaseUrl: checked ? release : null,
    checkedAt: status === "idle" ? null : stamp, error: status === "error" ? "network" : null,
    installSpec: INSTALL_SPEC, ...patch};
}
function snapshot(status = "idle", patch = {}) {
  return {data: data(status), pending: null, localError: null, cancelled: false, ...patch};
}
const tFor = language => key => {assert.equal(typeof dictionaries[language][key], "string", "missing translation: " + key); return dictionaries[language][key];};
const render = (value, language = "en", extra = {}) => renderToStaticMarkup(React.createElement(UpdatePanelContent, {snapshot: value, t: tFor(language), ...extra}));
const response = value => ({ok: true, json: async () => value});
const deferred = () => {let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject};};
const tick = () => new Promise(resolve => setImmediate(resolve));

for (const language of ["en", "zh"]) {
  for (const status of ["idle", "current", "update-available", "ahead", "error"]) {
    test("SSR " + language + " renders " + status + " without inventing a current result", () => {
      const value = snapshot(status);
      const html = render(value, language);
      assert.ok(html.includes(dictionaries[language]["updates." + status]));
      assert.ok(html.includes(value.data.currentVersion));
      assert.ok(html.includes(INSTALL_SPEC));
      if (status !== "current") assert.ok(!html.includes(dictionaries[language]["updates.current"]));
      if (status === "ahead") assert.match(html, /1\.3\.0-rc\.1/);
      if (status === "error") assert.match(html, /role="alert"/);
    });
  }
}

test("SSR pending/loading/cancelled override an old successful cached status", () => {
  for (const [patch, key] of [[{pending: "check"}, "checking"], [{pending: "load"}, "loading"], [{cancelled: true}, "cancelled"]]) {
    const html = render(snapshot("current", patch));
    assert.ok(html.includes(dictionaries.en["updates." + key]));
    assert.ok(!html.includes(dictionaries.en["updates.current"]));
  }
  assert.match(render(snapshot("current", {pending: "check"})), /<button[^>]*disabled=""[^>]*>Checking…<\/button>/);
});

test("all safe error reasons render localized failure, never up-to-date", () => {
  for (const error of ["network", "timeout", "rate-limited", "not-found", "invalid-response"]) {
    const html = render(snapshot("error", {data: data("error", {error})}));
    assert.ok(html.includes(dictionaries.en["updates.error." + error]));
    assert.ok(!html.includes(dictionaries.en["updates.current"]));
  }
  const html = render(snapshot("current", {localError: "network"}));
  assert.ok(!html.includes(dictionaries.en["updates.current"]));
  assert.ok(html.includes(dictionaries.en["updates.reloadStatus"]));
});

test("settings page includes the global updates section with no selected session", () => {
  const target = {sessionId: null};
  const html = renderToStaticMarkup(React.createElement(SettingsPage, {t: tFor("en"),
    targetSource: {getSnapshot: () => target, subscribe: () => () => {}}, returnToConversation() {}}));
  const empty = dictionaries.en["settings.profileEmpty"];
  assert.ok(html.includes(empty));
  assert.ok(html.includes(dictionaries.en["updates.title"]));
  const updateSection = html.search(/<section[^>]*class="[^"]*\blpa-update-panel\b/);
  assert.ok(updateSection > html.indexOf(empty));
});

test("real SSR does not mount effects or make a check request", () => {
  let calls = 0;
  const html = renderToStaticMarkup(React.createElement(UpdatePanel, {t: tFor("en"), fetcher: async () => {calls++; return response(data());}}));
  assert.equal(calls, 0);
  assert.ok(html.includes(dictionaries.en["updates.loading"]));
});

test("release links stay in this repo and open with safe relationship attributes", () => {
  assert.equal(safeReleaseUrl(release), release);
  assert.equal(safeReleaseUrl(release.replace("v1.2.8", "1.2.8%2Bbuild-1")), release.replace("v1.2.8", "1.2.8%2Bbuild-1"));
  for (const value of [null, "javascript:alert(1)", "http://github.com/Syngnat/dsh-prompt-assist/releases/tag/v1.2.8",
    "https://github.com.evil.test/Syngnat/dsh-prompt-assist/releases/tag/v1.2.8",
    "https://github.com/Other/dsh-prompt-assist/releases/tag/v1.2.8",
    "https://github.com/Syngnat/other/releases/tag/v1.2.8",
    "https://github.com/user@github.com/Syngnat/dsh-prompt-assist/releases/tag/v1.2.8",
    "https://user:pass@github.com/Syngnat/dsh-prompt-assist/releases/tag/v1.2.8",
    "https://github.com:444/Syngnat/dsh-prompt-assist/releases/tag/v1.2.8",
    release + "?next=evil", release + "#fragment", release + "/", release.replace("v1.2.8", "%2Fetc"),
    release.replace("v1.2.8", "v1.3.0-rc.1")]) assert.equal(safeReleaseUrl(value), null, String(value));
  const html = render(snapshot("update-available"));
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  assert.ok(html.includes("href=\"" + release + "\""));
  assert.doesNotMatch(render(snapshot("update-available", {data: data("update-available", {releaseUrl: "https://evil.test/release"})})), /href=/);
});

test("normalization drops remote HTML and never adopts a remote install target", () => {
  const state = normalizeUpdateState({...data("update-available"), installSpec: "https://evil.test/install", body: "<script>evil()</script>"});
  assert.equal(state.installSpec, INSTALL_SPEC);
  assert.equal(state.body, undefined);
  const html = render(snapshot("update-available", {data: state}));
  assert.doesNotMatch(html, /evil\.test|<script|evil\(\)/);
  assert.equal(INSTALL_SPEC, "github:Syngnat/dsh-prompt-assist");
  assert.doesNotMatch(INSTALL_SPEC, /#/);
});

test("copy always writes the fixed plain-text no-tag address", async () => {
  const values = [];
  await copyInstallSpec({writeText: async value => values.push(value)});
  assert.deepEqual(values, [INSTALL_SPEC]);
  await assert.rejects(copyInstallSpec({}), /clipboard-unavailable/);
});

test("untrusted version HTML is rejected and timestamps are bounded", () => {
  for (const patch of [{currentVersion: "<img src=x>"}, {status: "unknown"}, {error: "secret raw message"},
    {latestVersion: "1.3.0-rc.1"}, {checkedAt: Infinity}, {checkedAt: -1}]) assert.throws(() => normalizeUpdateState(data("update-available", patch)), /invalid-response/);
  assert.throws(() => normalizeUpdateState(data("current", {checkedAt: null})), /invalid-response/);
  assert.throws(() => normalizeUpdateState(data("error", {error: null})), /invalid-response/);
  assert.equal(normalizeUpdateState(data("update-available", {latestVersion: "1.2.8+build-1"})).latestVersion, "1.2.8+build-1");
  assert.equal(formatCheckedAt(0), "1970-01-01T00:00:00.000Z");
  assert.equal(formatCheckedAt(9e99), null);
  const html = render(snapshot("current"));
  assert.ok(html.includes(new Date(stamp).toISOString()));
  // The visible stamp is a readable UTC stamp, not the raw machine timestamp.
  assert.ok(html.includes("2026-10-18 00:00:00 UTC") || html.includes(" UTC"));
  assert.match(html, /<time dateTime="[^"]+">\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC<\/time>/);
  assert.ok(!/<time[^>]*>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z<\/time>/.test(html));
});

test("construction and mounting only read Host cache via GET", async () => {
  const calls = [];
  const controller = createUpdateController(async (url, init) => {calls.push({url, init}); return response(data());});
  assert.equal(calls.length, 0);
  await controller.start(); await tick();
  assert.equal(calls.length, 1); assert.equal(calls[0].url, UPDATE_ENDPOINT);
  assert.equal(calls[0].init.method, "GET"); assert.equal(calls[0].init.credentials, "same-origin");
  assert.equal(calls[0].init.body, undefined);
  assert.equal(controller.getSnapshot().data.status, "idle");
  controller.dispose();
});

test("only explicit check posts an empty body without conversation data", async () => {
  const calls = [];
  const controller = createUpdateController(async (url, init) => {calls.push({url, init}); return response(data(calls.length === 1 ? "idle" : "update-available"));});
  await controller.start(); await controller.check();
  assert.deepEqual(calls.map(value => value.init.method), ["GET", "POST"]);
  assert.equal(calls[1].url, UPDATE_ENDPOINT); assert.equal(calls[1].init.credentials, "same-origin");
  assert.deepEqual(JSON.parse(calls[1].init.body), {});
  assert.equal(controller.getSnapshot().data.status, "update-available");
  controller.dispose();
});

test("manual check preempts pending cache read; late GET cannot overwrite POST", async () => {
  const read = deferred(), check = deferred(), calls = [];
  const controller = createUpdateController((url, init) => {calls.push(init); return init.method === "GET" ? read.promise : check.promise;});
  const loading = controller.start();
  const checking = controller.check();
  assert.equal(calls[0].signal.aborted, true); assert.equal(controller.getSnapshot().pending, "check");
  assert.equal(await controller.check(), false); assert.equal(calls.length, 2);
  check.resolve(response(data("update-available"))); await checking;
  read.resolve(response(data("current"))); await loading;
  assert.equal(controller.getSnapshot().data.status, "update-available");
  controller.dispose();
});

test("unmount aborts and late response cannot publish even if fetch ignores abort", async () => {
  const wait = deferred(); let signal, changes = 0;
  const controller = createUpdateController((url, init) => {signal = init.signal; return wait.promise;});
  controller.subscribe(() => changes++);
  const pending = controller.start(); const before = changes;
  controller.dispose(); assert.equal(signal.aborted, true);
  wait.resolve(response(data("current"))); await pending;
  assert.equal(changes, before); assert.equal(controller.getSnapshot().data, null);
  assert.equal(await controller.check(), false);
});

test("StrictMode-style dispose/start protects the remounted request epoch", async () => {
  const waits = [deferred(), deferred()]; let count = 0;
  const controller = createUpdateController(() => waits[count++].promise);
  const old = controller.start(); controller.dispose(); const fresh = controller.start();
  waits[1].resolve(response(data("ahead"))); await fresh;
  waits[0].resolve(response(data("current"))); await old;
  assert.equal(controller.getSnapshot().data.status, "ahead");
  controller.dispose();
});

test("cancel hides old current status, drops late result, and permits a manual retry", async () => {
  const wait = deferred(); let count = 0;
  const controller = createUpdateController(() => {count++; return count === 2 ? wait.promise : Promise.resolve(response(data("current")));});
  await controller.start(); const pending = controller.check(); controller.cancel();
  assert.equal(updateDisplay(controller.getSnapshot()).status, "cancelled");
  wait.resolve(response(data("update-available"))); await pending;
  assert.equal(updateDisplay(controller.getSnapshot()).status, "cancelled");
  await controller.check(); assert.equal(updateDisplay(controller.getSnapshot()).status, "current");
  assert.equal(count, 3); controller.dispose();
});

test("network/invalid JSON/Host error remain failures and retry is explicit", async () => {
  let count = 0;
  const controller = createUpdateController(async () => {
    count++; if (count === 1) return response(data("current"));
    if (count === 2) throw Error("private upstream detail");
    if (count === 3) return {ok: true, json: async () => {throw new SyntaxError("bad JSON");}};
    return response(data("error", {error: "rate-limited"}));
  });
  await controller.start(); await controller.check();
  assert.equal(updateDisplay(controller.getSnapshot()).error, "network");
  assert.doesNotMatch(render(controller.getSnapshot()), /private upstream|matches the latest stable release/);
  await controller.load(); assert.equal(updateDisplay(controller.getSnapshot()).error, "invalid-response");
  await controller.check(); assert.equal(updateDisplay(controller.getSnapshot()).error, "rate-limited");
  assert.equal(count, 4); controller.dispose();
});

test("all new copy is bilingual and client uses no auto-check timers or remote HTML", () => {
  const zh = Object.keys(dictionaries.zh).filter(key => key.startsWith("updates.")).sort();
  const en = Object.keys(dictionaries.en).filter(key => key.startsWith("updates.")).sort();
  assert.deepEqual(zh, en); assert.ok(zh.length > 20);
  for (const file of ["update-state.js", "update-panel.js"]) {
    const source = readFileSync(new URL("../assist/client/" + file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /setInterval|setTimeout|dangerouslySetInnerHTML|innerHTML|plugin_manager/);
  }
});

for(const lang of ['en','zh'])test('SSR '+lang+' highlights an available release without highlighting stale status',()=>{
 const html=render(snapshot('update-available'),lang);
 assert.match(html,/lpa-update-summary lpa-update-summary--available/);assert.match(html,/lpa-update-field--highlight/);
 assert.ok(html.includes(dictionaries[lang]['updates.availableTitle']));assert.ok(html.includes(dictionaries[lang]['updates.availableHint']));
 for(const patch of [{pending:'check'},{cancelled:true},{localError:'network'}]){const stale=render(snapshot('update-available',patch),lang);assert.doesNotMatch(stale,/lpa-update-summary--available|lpa-update-field--highlight/);}
});

test("one explicit install action gates on the consent checkbox", async () => {
  const React = await import("react");
  const {renderToStaticMarkup} = await import("react-dom/server");
  const {OnlineUpdatePanelContent} = await import("../assist/client/online-update-panel.js");
  const snapshot = {data: {available: true, reason: null, source: null, operation: null}, preparation: null, consent: false, pending: null,
    localError: null, uncertain: false, recordLost: false, confirmationRejected: false, recoveryAcknowledged: false, markerCleared: false};
  const html = acknowledged => renderToStaticMarkup(React.createElement(OnlineUpdatePanelContent,
    {snapshot, updateAvailable: true, t: key => key, acknowledged, onInstall() {}, onReload() {}}));
  const blocked = html(false);
  assert.match(blocked, /online\.installConsent/);
  assert.match(blocked, /<button[^>]*disabled=""[^>]*>online\.installNow<\/button>/);
  assert.doesNotMatch(blocked, /online\.prepare/);
  const allowed = html(true);
  assert.ok(!/<button[^>]*disabled=""[^>]*>online\.installNow<\/button>/.test(allowed));
  assert.match(allowed, />online\.installNow</);
});
