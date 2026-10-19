import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {createOnlineUpdateController, normalizeOnlineOperation, normalizeOnlineStatus, normalizeOnlinePreparation, initialOnlineSnapshot, canForgetOnlineMarker, ONLINE_PHASES, ONLINE_UPDATE_ENDPOINT, ONLINE_MARKER_KEY} from "../assist/client/online-update-state.js";
import {OnlineUpdatePanelContent, OnlineUpdatePanel} from "../assist/client/online-update-panel.js";
import {UpdatePanelContent} from "../assist/client/update-panel.js";
import {dictionaries} from "../assist/client/messages.js";
const now = 1792288800000;
const prep = (patch = {}) => ({token: "confirmation_token_123456", fromVersion: "1.2.10", targetVersion: "1.2.11", targetSpec: "github:Syngnat/dsh-prompt-assist#" + "a".repeat(40), restoreSpec: "github:Syngnat/dsh-prompt-assist#" + "b".repeat(40), expiresAt: now + 60000, ...patch});
const op = (patch = {}) => ({jobId: "job-1", fromVersion: "1.2.10", targetVersion: "1.2.11", phase: "installing", terminal: false, installedVersion: null, error: null, detailCode: null, restartRequired: false, cancelRequested: false, ...patch});
const status = (operation = null, patch = {}) => ({currentVersion: "1.2.10", available: true, reason: null, operation, ...patch});
const response = (value, ok = true) => ({ok, json: async () => value});
const deferred = () => {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};};
const tick = () => new Promise(r => setImmediate(r));
function harness(fetcher) {
  const timers = new Map(), delays = [], calls = []; let next = 0;
  const controller = createOnlineUpdateController(async (url, init) => {calls.push({url, init}); return fetcher(url, init, calls.length);}, {now: () => now,
    setTimer: (fn, ms) => {timers.set(++next, fn); delays.push(ms); return next;}, clearTimer: id => timers.delete(id), pollMs: 1});
  return {controller, calls, timers, delays, poll: async () => {const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); await tick();}};
}
const translator = lang => key => {assert.equal(typeof dictionaries[lang][key], "string", key); return dictionaries[lang][key];};
const render = (snapshot, lang = "en", extra = {}) => renderToStaticMarkup(React.createElement(OnlineUpdatePanelContent, {snapshot, t: translator(lang), updateAvailable: true, ...extra}));

test("construction, mounting and idle reload only GET; idle never polls", async () => {
  const h = harness(async () => response(status()));
  assert.equal(h.calls.length, 0); await h.controller.start(); await h.controller.load();
  assert.deepEqual(h.calls.map(x => x.init.method), ["GET", "GET"]); assert.equal(h.timers.size, 0);
  for (const c of h.calls) {assert.equal(c.url, ONLINE_UPDATE_ENDPOINT); assert.equal(c.init.body, undefined); assert.equal(c.init.credentials, "same-origin");}
  h.controller.dispose();
});
test("only prepare then explicit boolean consent can confirm; token consumed once", async () => {
  const h = harness(async (url, init) => response(init.method === "GET" ? status() : JSON.parse(init.body).action === "prepare" ? prep() : op()));
  await h.controller.start(); assert.equal(await h.controller.confirm(), false);
  await h.controller.prepare(); assert.equal(await h.controller.confirm(), false);
  h.controller.setConsent("true"); assert.equal(await h.controller.confirm(), false);
  h.controller.setConsent(true); await h.controller.confirm(); assert.equal(await h.controller.confirm(), false);
  assert.deepEqual(h.calls.map(x => x.init.body && JSON.parse(x.init.body)), [undefined, {action: "prepare"}, {action: "confirm", token: prep().token, targetVersion: "1.2.11", consent: true}]);
  assert.equal(h.controller.getSnapshot().preparation, null); assert.equal(h.timers.size, 1); h.controller.dispose();
});
test("active operation polls GET at minimum 3s and terminal result stops polling", async () => {
  let data = status(op()); const h = harness(async () => response(data));
  await h.controller.start(); assert.equal(h.timers.size, 1); assert.equal(h.delays[0], 3000);
  assert.equal(await h.controller.prepare(), false); await h.poll();
  data = status(op({phase: "updated", terminal: true, installedVersion: "1.2.11"})); await h.poll();
  assert.equal(h.timers.size, 0); assert.ok(h.calls.every(x => x.init.method === "GET")); h.controller.dispose();
});
test("network recovery only polls GET for known active job and never resends POST", async () => {
  const h = harness(async (url, init, count) => {if (count === 2) throw Error("secret"); return response(status(op()));});
  await h.controller.start(); await h.poll(); assert.equal(h.controller.getSnapshot().localError, "network");
  await h.poll(); assert.equal(h.controller.getSnapshot().localError, null); assert.ok(h.calls.every(x => x.init.method === "GET")); h.controller.dispose();
});
test("lost confirmation response is uncertain, never retries and recovers through GET", async () => {
  let loaded = status(); const h = harness(async (url, init) => {
    if (init.method === "GET") return response(loaded);
    if (JSON.parse(init.body).action === "prepare") return response(prep()); throw Error("network");
  });
  await h.controller.start(); await h.controller.prepare(); h.controller.setConsent(true); await h.controller.confirm();
  assert.equal(h.controller.getSnapshot().uncertain, true); assert.equal(h.timers.size, 0);
  assert.equal(await h.controller.prepare(), false); assert.equal(await h.controller.confirm(), false);
  await h.controller.load(); assert.equal(h.controller.getSnapshot().recordLost, true);
  loaded = status(op()); await h.controller.load(); assert.equal(h.controller.getSnapshot().uncertain, false);
  assert.equal(h.calls.filter(x => x.init.body && JSON.parse(x.init.body).action === "confirm").length, 1); h.controller.dispose();
});
test("previous terminal record cannot resolve a newer lost confirmation", async () => {
  const previous = op({jobId: "old-job", phase: "updated", terminal: true, installedVersion: "1.2.11"});
  const h = harness(async (url, init) => {if (init.method === "GET") return response(status(previous)); if (JSON.parse(init.body).action === "prepare") return response(prep()); throw Error("lost");});
  await h.controller.start(); await h.controller.prepare(); h.controller.setConsent(true); await h.controller.confirm(); await h.controller.load();
  assert.equal(h.controller.getSnapshot().uncertain, true); assert.ok(!render(h.controller.getSnapshot()).includes(dictionaries.en["online.phase.updated"])); h.controller.dispose();
});
test("lost operation never becomes successful or silently prepares a duplicate", async () => {
  let data = status(op()); const h = harness(async () => response(data)); await h.controller.start();
  data = status(); await h.poll(); assert.equal(h.controller.getSnapshot().recordLost, true); assert.equal(h.timers.size, 0);
  assert.equal(await h.controller.prepare(), false); assert.ok(render(h.controller.getSnapshot()).includes(dictionaries.en["online.recordLost"])); h.controller.dispose();
});
test("unmount during confirmation aborts local fetch only; no cancellation POST or late publish", async () => {
  const wait = deferred(); const h = harness(async (url, init) => init.method === "GET" ? response(status()) : JSON.parse(init.body).action === "prepare" ? response(prep()) : wait.promise);
  await h.controller.start(); await h.controller.prepare(); h.controller.setConsent(true); let changes = 0; h.controller.subscribe(() => changes++);
  const pending = h.controller.confirm(); const before = changes; h.controller.dispose();
  assert.equal(h.calls.at(-1).init.signal.aborted, true); wait.resolve(response(op())); await pending;
  assert.equal(changes, before); assert.equal(h.timers.size, 0); assert.equal(h.calls.length, 3); assert.equal(h.controller.getSnapshot().preparation, null);
});
test("dispose/start ignores an earlier read and rereads only status", async () => {
  const waits = [deferred(), deferred()]; const h = harness((url, init, count) => waits[count-1].promise);
  const old = h.controller.start(); h.controller.dispose(); const fresh = h.controller.start();
  waits[1].resolve(response(status(op()))); await fresh; waits[0].resolve(response(status())); await old;
  assert.equal(h.controller.getSnapshot().data.operation.jobId, "job-1"); assert.equal(h.timers.size, 1); h.controller.dispose();
});
test("duplicate prepare and concurrent reload do not race in-flight preparation", async () => {
  const wait = deferred(); const h = harness((url, init) => init.method === "GET" ? response(status()) : wait.promise);
  await h.controller.start(); const pending = h.controller.prepare(); assert.equal(await h.controller.prepare(), false); assert.equal(await h.controller.load(), false);
  wait.resolve(response(prep())); await pending; h.controller.setConsent(true); h.controller.dismiss();
  assert.equal(await h.controller.confirm(), false); assert.equal(h.calls.length, 2); h.controller.dispose();
});
test("expired confirmation never posts and new preparation resets consent", async () => {
  let clock = now; const calls = []; const c = createOnlineUpdateController(async (url, init) => {calls.push(init); return response(init.method === "GET" ? status() : prep());}, {now: () => clock});
  await c.start(); await c.prepare(); c.setConsent(true); clock = prep().expiresAt; assert.equal(await c.confirm(), false);
  assert.equal(c.getSnapshot().localError, "confirmation-expired"); assert.equal(calls.length, 2); clock = now; await c.prepare(); assert.equal(c.getSnapshot().consent, false); c.dispose();
});
test("unavailable Host blocks preparation", async () => {
  const h = harness(async () => response(status(null, {available: false, reason: "unsupported-installation"})));
  await h.controller.start(); assert.equal(await h.controller.prepare(), false); assert.equal(h.calls.length, 1); h.controller.dispose();
});
test("validators reject malformed or unsafe payloads and retain only public fields", () => {
  for (const patch of [{phase: "success"}, {terminal: true}, {jobId: "<script>"}, {fromVersion: "x"}, {error: "secret raw message"}, {detailCode: {}}, {restartRequired: 1}, {cancelRequested: null}, {installedVersion: "evil"}]) assert.throws(() => normalizeOnlineOperation(op(patch)), /invalid-response/);
  assert.throws(() => normalizeOnlineOperation(op({phase: "updated", terminal: true})), /invalid-response/);
  assert.throws(() => normalizeOnlineOperation(op({phase: "restart-required", terminal: true})), /invalid-response/);
  assert.equal(normalizeOnlineOperation(op({phase: "unknown", terminal: false})).terminal, false);
  assert.equal(normalizeOnlineOperation(op({phase: "unknown", terminal: true})).terminal, true);
  for (const patch of [{available: "true"}, {reason: "private raw path"}, {operation: undefined}, {currentVersion: "<html>"}]) assert.throws(() => normalizeOnlineStatus(status(null, patch)), /invalid-response/);
  for (const patch of [{token: "x"}, {expiresAt: now}, {expiresAt: Infinity}, {targetSpec: "github:Other/repo#" + "a".repeat(40)}, {restoreSpec: "https://evil.test"}, {targetVersion: "<img>"}]) assert.throws(() => normalizeOnlinePreparation(prep(patch), now), /invalid-response/);
  assert.equal(normalizeOnlineStatus({...status(), token: "secret"}).token, undefined);
  assert.equal(normalizeOnlineOperation({...op(), private: "secret"}).private, undefined);
});
test("HTTP errors and invalid JSON are safe failures, never authority", async () => {
  for (const value of [response({error: "inventory-changed"}, false), response({error: "C:/private/data"}, false), {ok: true, json: async () => {throw Error("raw secret");}}]) {
    const h = harness(async () => value); await h.controller.start(); assert.equal(h.controller.getSnapshot().data, null); assert.doesNotMatch(render(h.controller.getSnapshot()), /private|raw secret/); h.controller.dispose();
  }
});
for (const lang of ["zh", "en"]) {
  test("SSR " + lang + " labels a historical record instead of implying the running version", () => {
    const stale = {...initialOnlineSnapshot(), data: status(op({phase: "updated", terminal: true, fromVersion: "1.2.12", targetVersion: "1.2.13", installedVersion: "1.2.13"}), {currentVersion: "1.2.18"})};
    const html = render(stale, lang, {currentVersion: "1.2.18"});
    assert.ok(html.includes(dictionaries[lang]["online.runningVersion"]));
    assert.ok(html.includes(dictionaries[lang]["online.taskFrom"]));
    assert.ok(html.includes(dictionaries[lang]["online.recordStale"]));
    assert.ok(html.includes("1.2.18") && html.includes("1.2.13"));
    // An expired record is demoted into a collapsed history block, so the main view cannot be misread.
    assert.match(html, /<details class="lpa-update-history">/);
    assert.match(html, /<summary>[^<]*<code>1\.2\.12<\/code> → <code>1\.2\.13<\/code>/);
    assert.ok(html.includes(dictionaries[lang]["online.history"]));
    const same = {...initialOnlineSnapshot(), data: status(op({phase: "updated", terminal: true, installedVersion: "1.2.13"}), {currentVersion: "1.2.13"})};
    const current = render(same, lang, {currentVersion: "1.2.13"});
    assert.ok(!current.includes(dictionaries[lang]["online.recordStale"]));
    assert.doesNotMatch(current, /lpa-update-history/);
    assert.ok(current.includes(dictionaries[lang]["online.phase.updated"]));
    // Embedded in the version card, the availability banner belongs to the parent and must not repeat.
    const available = {...initialOnlineSnapshot(), data: status()};
    assert.match(render(available, lang), /lpa-update-banner/);
    assert.doesNotMatch(render(available, lang, {showAvailability: false}), /lpa-update-banner/);
    // Confirmation expiry is readable too, while the machine-readable attribute stays exact.
    const preparation = render({...initialOnlineSnapshot(), data: status(), preparation: prep()}, lang);
    assert.match(preparation, /<time dateTime="[^"]+">\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC<\/time>/);
  });
  test("SSR " + lang + " confirmation names pinned versions and all risks without revealing nonce", () => {
    const snapshot = {...initialOnlineSnapshot(), data: status(), preparation: prep()}; const html = render(snapshot, lang);
    for (const key of ["online.risks", "online.continuity", "online.consent"]) assert.ok(html.includes(dictionaries[lang][key]));
    assert.match(html, /type="checkbox"/); assert.match(html, /<button[^>]*disabled=""[^>]*>/); assert.doesNotMatch(html, /checked=""/);
    assert.ok(html.includes(prep().targetSpec)); assert.ok(html.includes(prep().restoreSpec)); assert.ok(!html.includes(prep().token));
    assert.match(render({...snapshot, consent: true}, lang), /checked=""/);
    assert.ok(!render({...snapshot, preparation: null}, lang, {updateAvailable: false}).includes(dictionaries[lang]["online.prepare"]));
  });
  test("SSR " + lang + " distinguishes each phase including failed recovery and unknown", () => {
    for (const phase of ONLINE_PHASES) {
      const html = render({...initialOnlineSnapshot(), data: status(op({phase}))}, lang);
      assert.ok(html.includes(dictionaries[lang]["online.phase." + phase]));
      if (phase !== "updated") assert.ok(!html.includes(dictionaries[lang]["online.phase.updated"]));
    }
  });
}
test("SSR mounts neither effects nor requests; UpdatePanelContent keeps optional manual path", () => {
  let calls = 0; renderToStaticMarkup(React.createElement(OnlineUpdatePanel, {t: translator("en"), updateAvailable: true, fetcher: () => {calls++; throw Error("no network");}})); assert.equal(calls, 0);
  const html = renderToStaticMarkup(React.createElement(UpdatePanelContent, {t: translator("en")}, React.createElement("div", null, "child-marker")));
  assert.ok(html.includes("child-marker")); assert.ok(html.includes(dictionaries.en["updates.manualUpgrade"]));
});
test("bilingual copy complete; no persisted nonce, HTML injection or unload cancel hooks", () => {
  assert.deepEqual(Object.keys(dictionaries.zh).filter(k => k.startsWith("online.")).sort(), Object.keys(dictionaries.en).filter(k => k.startsWith("online.")).sort());
  for (const file of ["online-update-state.js", "online-update-panel.js"]) {
    const source = readFileSync(new URL("../assist/client/" + file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /localStorage|dangerouslySetInnerHTML|beforeunload|sendBeacon|plugin_manager|setInterval/);
  }
});

const memoryStorage = () => {
  const values = new Map(); return {values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
};
test("persistent marker excludes nonce and survives uninstall/remount; known job completion clears it", async () => {
  const storage = memoryStorage();
  const c = createOnlineUpdateController(async (url, init) => response(init.method === "GET" ? status() : JSON.parse(init.body).action === "prepare" ? prep() : op()), {now: () => now, storage});
  await c.start(); await c.prepare(); c.setConsent(true); await c.confirm(); c.dispose();
  assert.deepEqual(JSON.parse(storage.getItem(ONLINE_MARKER_KEY)), {fromVersion: "1.2.10", targetVersion: "1.2.11", jobId: "job-1"});
  assert.ok(!storage.getItem(ONLINE_MARKER_KEY).includes(prep().token));
  let data = status(); const calls = [];
  const fresh = createOnlineUpdateController(async (url, init) => {calls.push(init); return response(data);}, {storage});
  await fresh.start(); assert.equal(fresh.getSnapshot().recordLost, true); assert.equal(await fresh.prepare(), false);
  data = status(op({phase: "updated", terminal: true, installedVersion: "1.2.11"})); await fresh.load();
  assert.equal(fresh.getSnapshot().uncertain, false); assert.equal(storage.getItem(ONLINE_MARKER_KEY), null);
  assert.ok(calls.every(x => x.method === "GET")); fresh.dispose();
});
test("lost confirm stores marker before POST; remount cannot mistake an old terminal job for success", async () => {
  const storage = memoryStorage(); let posts = 0;
  const c = createOnlineUpdateController(async (url, init) => {
    if (init.method === "GET") return response(status());
    posts++; if (JSON.parse(init.body).action === "prepare") return response(prep());
    assert.deepEqual(JSON.parse(storage.getItem(ONLINE_MARKER_KEY)), {fromVersion: "1.2.10", targetVersion: "1.2.11", jobId: null});
    assert.ok(!storage.getItem(ONLINE_MARKER_KEY).includes(prep().token)); throw Error("lost");
  }, {now: () => now, storage});
  await c.start(); await c.prepare(); c.setConsent(true); await c.confirm(); c.dispose();
  let data = status(op({phase: "updated", terminal: true, installedVersion: "1.2.11"}));
  const fresh = createOnlineUpdateController(async () => response(data), {storage}); await fresh.start();
  assert.equal(fresh.getSnapshot().uncertain, true); assert.ok(!render(fresh.getSnapshot()).includes(dictionaries.en["online.phase.updated"]));
  data = status(op()); await fresh.load(); assert.equal(fresh.getSnapshot().uncertain, false);
  assert.equal(JSON.parse(storage.getItem(ONLINE_MARKER_KEY)).jobId, "job-1"); assert.equal(posts, 2); fresh.dispose();
});
test("storage failures or malformed marker safely degrade without failing reads", async () => {
  for (const storage of [{getItem() {throw Error("denied");}, setItem() {throw Error("denied");}, removeItem() {throw Error("denied");}}, {getItem: () => '{"fromVersion":"<script>"}'}, null]) {
    const c = createOnlineUpdateController(async (url, init) => response(init.method === "GET" ? status() : JSON.parse(init.body).action === "prepare" ? prep() : op({phase: "failed", terminal: true})), {now: () => now, storage});
    await c.start(); await c.prepare(); c.setConsent(true); assert.equal(await c.confirm(), true); assert.equal(c.getSnapshot().localError, null); c.dispose();
  }
});
test("confirmation operation must match the reviewed versions", async () => {
  const h = harness(async (url, init) => response(init.method === "GET" ? status() : JSON.parse(init.body).action === "prepare" ? prep() : op({targetVersion: "9.0.0"})));
  await h.controller.start(); await h.controller.prepare(); h.controller.setConsent(true); assert.equal(await h.controller.confirm(), false);
  assert.equal(h.controller.getSnapshot().localError, "invalid-response"); assert.equal(h.controller.getSnapshot().uncertain, true); h.controller.dispose();
});

for (const error of ["confirmation-expired", "confirmation-required", "inventory-changed", "busy", "invalid-request", "owner-confirmation-required", "unavailable"]) {
  test("explicit Host rejection " + error + " clears pending marker without retrying confirmation", async () => {
    const storage = memoryStorage(), calls = [];
    const c = createOnlineUpdateController(async (url, init) => {
      calls.push(init); return response(init.method === "GET" ? status() : JSON.parse(init.body).action === "prepare" ? prep() : {error}, init.method === "GET" || JSON.parse(init.body).action === "prepare");
    }, {storage, now: () => now});
    await c.start(); await c.prepare(); c.setConsent(true); assert.equal(await c.confirm(), false);
    assert.equal(c.getSnapshot().confirmationRejected, true); assert.equal(c.getSnapshot().uncertain, false); assert.equal(c.getSnapshot().recordLost, false);
    assert.equal(storage.getItem(ONLINE_MARKER_KEY), null); assert.equal(c.getSnapshot().preparation, null); assert.equal(c.getSnapshot().consent, false);
    assert.ok(render(c.getSnapshot()).includes(dictionaries.en["online.confirmationRejected"]));
    assert.equal(await c.confirm(), false); await c.load(); assert.equal(c.getSnapshot().recordLost, false);
    assert.equal(await c.prepare(), true); assert.equal(await c.confirm(), false);
    assert.equal(calls.filter(x => x.body && JSON.parse(x.body).action === "confirm").length, 1); c.dispose();
    const fresh = createOnlineUpdateController(async () => response(status()), {storage}); await fresh.start(); assert.equal(fresh.getSnapshot().uncertain, false); fresh.dispose();
  });
}
test("transport, invalid JSON, malformed error and unknown Host error remain uncertain", async () => {
  for (const failure of [
    () => {throw Object.assign(Error("lost"), {code: "confirmation-expired"});},
    () => ({ok: false, json: async () => {throw Error("bad JSON");}}),
    () => response({error: "confirmation-expired", unexpected: true}, false),
    () => response({error: "host-error"}, false),
    () => response({error: "confirmation-expired"}),
  ]) {
    const storage = memoryStorage(); let count = 0;
    const c = createOnlineUpdateController(async (url, init) => {count++; if (init.method === "GET") return response(status()); if (JSON.parse(init.body).action === "prepare") return response(prep()); return failure();}, {storage, now: () => now});
    await c.start(); await c.prepare(); c.setConsent(true); await c.confirm();
    assert.equal(c.getSnapshot().uncertain, true); assert.equal(c.getSnapshot().confirmationRejected, false); assert.notEqual(storage.getItem(ONLINE_MARKER_KEY), null);
    assert.equal(await c.prepare(), false); assert.equal(await c.confirm(), false); assert.equal(count, 3); c.dispose();
  }
});
test("manual local-marker clearing needs a successful reread, explicit acknowledgement and fresh prepare", async () => {
  const storage = memoryStorage(), calls = [];
  const c = createOnlineUpdateController(async (url, init) => {calls.push(init); if (init.method === "GET") return response(status()); if (JSON.parse(init.body).action === "prepare") return response(prep()); throw Error("lost");}, {storage, now: () => now});
  await c.start(); await c.prepare(); c.setConsent(true); await c.confirm();
  c.setRecoveryAcknowledged(true); assert.equal(c.forgetMarker(), false); assert.equal(canForgetOnlineMarker(c.getSnapshot()), false);
  await c.load(); assert.equal(canForgetOnlineMarker(c.getSnapshot()), true); assert.equal(c.forgetMarker(), false);
  c.setRecoveryAcknowledged("true"); assert.equal(c.forgetMarker(), false);
  c.setRecoveryAcknowledged(true); const before = calls.length; assert.equal(c.forgetMarker(), true);
  assert.equal(calls.length, before); assert.equal(storage.getItem(ONLINE_MARKER_KEY), null); assert.equal(c.getSnapshot().markerCleared, true);
  assert.equal(c.getSnapshot().data, null); assert.equal(c.getSnapshot().preparation, null); assert.equal(c.getSnapshot().consent, false);
  assert.equal(await c.prepare(), false); assert.equal(await c.confirm(), false);
  await c.load(); assert.equal(c.getSnapshot().uncertain, false); assert.equal(await c.confirm(), false);
  await c.prepare(); assert.equal(c.getSnapshot().consent, false); assert.equal(await c.confirm(), false);
  assert.equal(calls.filter(x => x.body && JSON.parse(x.body).action === "confirm").length, 1); c.dispose();
});
test("marker-clear acknowledgement resets on every reload and cannot bypass an active job", async () => {
  const storage = memoryStorage(); storage.setItem(ONLINE_MARKER_KEY, JSON.stringify({fromVersion: "1.2.10", targetVersion: "1.2.11", jobId: "missing-job"}));
  let data = status(); const h = createOnlineUpdateController(async () => response(data), {storage, setTimer: () => 1, clearTimer: () => {}});
  assert.equal(h.forgetMarker(), false); await h.start(); h.setRecoveryAcknowledged(true); await h.load(); assert.equal(h.getSnapshot().recoveryAcknowledged, false);
  h.setRecoveryAcknowledged(true); data = status(op()); await h.load(); assert.equal(canForgetOnlineMarker(h.getSnapshot()), false); h.setRecoveryAcknowledged(true); assert.equal(h.forgetMarker(), false);
  h.dispose(); assert.equal(h.forgetMarker(), false);
});
test("unknown terminal record can be manually forgotten, but busy or failed reads cannot", () => {
  const base = {...initialOnlineSnapshot(), uncertain: true, data: status(op({phase: "unknown", terminal: true}))};
  assert.equal(canForgetOnlineMarker(base), true);
  for (const patch of [{pending: "load"}, {localError: "network"}, {data: null}, {data: status(null, {available: false, reason: "busy"})}, {uncertain: false, recordLost: false}]) assert.equal(canForgetOnlineMarker({...base, ...patch}), false);
});
for (const lang of ["en", "zh"]) {
  test("SSR " + lang + " marker recovery uses separate unchecked human acknowledgement", () => {
    const snapshot = {...initialOnlineSnapshot(), data: status(), uncertain: true, recordLost: true};
    const html = render(snapshot, lang);
    assert.ok(html.includes(dictionaries[lang]["online.forgetWarning"])); assert.ok(html.includes(dictionaries[lang]["online.forgetAcknowledgement"]));
    assert.match(html, /type="checkbox"/); assert.doesNotMatch(html, /checked=""/);
    assert.ok(html.includes('disabled="">' + dictionaries[lang]["online.forgetMarker"]));
    const checked = render({...snapshot, recoveryAcknowledged: true}, lang);
    assert.ok(!checked.includes('disabled="">' + dictionaries[lang]["online.forgetMarker"]));
    const active = render({...snapshot, data: status(op()), recoveryAcknowledged: true}, lang);
    assert.ok(active.includes('disabled="">' + dictionaries[lang]["online.forgetMarker"]));
    const cleared = render({...initialOnlineSnapshot(), markerCleared: true}, lang);
    assert.ok(cleared.includes(dictionaries[lang]["online.markerCleared"])); assert.ok(!cleared.includes(dictionaries[lang]["online.phase.updated"]));
  });
}

test('terminal receipt continues local polling until the registry releases its busy flag',async()=>{const finished=op({phase:'updated',terminal:true,installedVersion:'1.2.11'});let data=status(finished,{available:false,reason:'busy'});const h=harness(async()=>response(data));await h.controller.start();assert.equal(h.timers.size,1);data=status(finished);await h.poll();assert.equal(h.timers.size,0);h.controller.dispose();});

for(const lang of ['en','zh'])test('SSR '+lang+' gives available updates and confirmation distinct emphasis',()=>{
 const base={...initialOnlineSnapshot(),data:status()};const html=render(base,lang);
 assert.match(html,/class="lpa-update-banner"[^>]*role="status"/);
 assert.ok(html.includes(dictionaries[lang]['online.badge']));assert.ok(html.includes(dictionaries[lang]['online.availableTitle']));assert.ok(html.includes(dictionaries[lang]['online.availableHint']));
 assert.match(html,/<button[^>]*class="lpa-button lpa-button--primary"[^>]*>/);
 const review=render({...base,preparation:prep()},lang);
 assert.match(review,/class="lpa-update-review"/);assert.match(review,/class="lpa-update-risk"/);assert.match(review,/class="lpa-update-consent"/);
 assert.ok(review.includes(dictionaries[lang]['online.consentTitle']));
 assert.match(review,/<button[^>]*class="lpa-button lpa-button--primary lpa-button--danger"[^>]*disabled=""/);
 for(const patch of [{data:status(op())},{data:status(op({phase:'unknown',terminal:true}))},{uncertain:true},{recordLost:true},{pending:'confirm'},{data:status(null,{available:false})}])assert.doesNotMatch(render({...base,...patch},lang),/class="lpa-update-banner"/);
 assert.doesNotMatch(render(base,lang,{updateAvailable:false}),/class="lpa-update-banner"/);
});

test("online update is an unboxed subsection with unchanged confirmation semantics", () => {
  const base={...initialOnlineSnapshot(),data:status(),preparation:prep()};
  const html=render(base);
  assert.match(html,/<section class="lpa-subsection lpa-online-update" aria-label="[^"]+" aria-busy="false"/);
  assert.doesNotMatch(html,/<section class="[^"]*lpa-update-panel/);
  assert.match(html,/lpa-card-actions/);
  assert.match(html,/<button[^>]*class="lpa-button lpa-button--primary lpa-button--danger"[^>]*disabled=""/);
  assert.match(render({...base,consent:true}),/<button[^>]*class="lpa-button lpa-button--primary lpa-button--danger"(?![^>]*disabled)[^>]*>/);
});
