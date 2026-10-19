import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {SettingsPage} from "../assist/client/settings-page.js";
import {EnablementPanelContent} from "../assist/client/enablement-panel.js";
import {PriorityPanelContent} from "../assist/client/priority-panel.js";
import {UpdatePanelContent} from "../assist/client/update-panel.js";
import {OnlineUpdatePanelContent} from "../assist/client/online-update-panel.js";
import {css} from "../assist/client/style.js";
const h = React.createElement;
const render = (Component, props, children) => renderToStaticMarkup(h(Component, {t: key => key, ...props}, children));
const live = {data: {revision: 3, enabled: {suggest: true, enhance: false}}, connected: true, loading: false, pending: null, readError: null, writeError: null, saved: null};
function page(sessionId = null) {
  const target = {sessionId};
  return render(SettingsPage, {targetSource: {getSnapshot: () => target, subscribe: () => () => {}},
    globalSource: {getSnapshot: () => live, subscribe: () => () => {}},
    connection: {rpc: {call: () => {throw new Error("SSR must not invoke RPC");}}},
    useSessionAccess: () => true, returnToConversation() {}, assistSend() {throw new Error("SSR must not request models");}});
}

test("settings page exposes four ordered card sections and a useful empty-session state", () => {
  const html = page();
  assert.equal((html.match(/<section[^>]*class="[^"]*\blpa-card(?=[\s"])/g) ?? []).length, 4);
  const titles = [...html.matchAll(/<h2[^>]*>(settings\.[^<]+)<\/h2>/g)].map(match => match[1]);
  assert.deepEqual(titles, ["settings.globalSection", "settings.sessionSection", "settings.prioritySection", "settings.updatesSection"]);
  assert.match(html, /settings.subtitle/);
  assert.match(html, /class="[^"]*lpa-empty-state[^"]*"[^>]*role="status">settings.sessionEmpty/);
});

test("global switches remain real checked/disabled checkboxes with labeled switch rows", () => {
  const html = render(EnablementPanelContent, {snapshot: live});
  const inputs = html.match(/<input[^>]+>/g) ?? [];
  assert.equal(inputs.length, 2);
  assert.ok(inputs.every(input => /type="checkbox"/.test(input) && /class="lpa-switch"/.test(input)));
  assert.match(inputs[0], /checked=""/); assert.doesNotMatch(inputs[1], /checked=""/);
  assert.equal((html.match(/lpa-switch-row/g) ?? []).length, 2);
  assert.match(html, /global.suggestHint/); assert.match(html, /global.enhanceHint/);
  assert.match(html, /class="lpa-footnote"/);
  const blocked = render(EnablementPanelContent, {snapshot: {...live, connected: false}});
  assert.equal((blocked.match(/<input[^>]*disabled=""/g) ?? []).length, 2);
});

test("session identity stays visible inside a readonly chip", () => {
  const html = page("session-1");
  assert.match(html, /<code class="lpa-chip lpa-chip--readonly">session-1<\/code>/);
  assert.doesNotMatch(html, /settings.sessionEmpty/);
  assert.match(html, /role="status">loading/);
});

test("Priority chips keep read-only and revocable authorization separate", () => {
  const state = {revision: 2, configured: ["openai"], authorized: ["proxy"], effective: ["openai", "proxy"]};
  const candidates = [{id: "partner", name: "Partner", configured: false, openAIModels: ["GPT-6.1"]}];
  const html = render(PriorityPanelContent, {state, candidates, consent: true, selected: "partner"});
  assert.match(html, /class="[^"]*lpa-chip--readonly[^"]*"[^>]*><code>openai<\/code>/);
  assert.match(html, /class="[^"]*lpa-chip[^"]*"[^>]*><code>proxy<\/code>/);
  assert.match(html, /aria-label="priority.revoke: proxy"/);
  assert.doesNotMatch(html, /aria-label="priority.revoke: openai"/);
  assert.match(html, /class="lpa-card-actions[^"]*"/);
  assert.match(html, /<button(?![^>]*disabled)[^>]*>priority.authorize<\/button>/);
  const empty = render(PriorityPanelContent, {state, candidates: []});
  assert.doesNotMatch(empty, /<select/);
  assert.match(empty, /priority.noProviderModels/);
});

test("update card has three stats, collapsed privacy, divider and one-line install row", () => {
  const snapshot = {data: {currentVersion: "1.2.30", latestVersion: "1.2.31", status: "update-available", checkedAt: 1792288800000, error: null, releaseUrl: null}, pending: null, localError: null, cancelled: false};
  const child = h(OnlineUpdatePanelContent, {t: key => key});
  const html = render(UpdatePanelContent, {snapshot}, child);
  assert.equal((html.match(/class="[^"]*\blpa-stat(?=[\s"])/g) ?? []).length, 3);
  assert.match(html, /lpa-stat--highlight/);
  assert.match(html, /class="lpa-divider"/);
  assert.match(html, /class="lpa-update-install lpa-install-row"/);
  assert.match(html, /<details class="lpa-footnote-details"><summary>settings.advanced<\/summary>/);
  assert.doesNotMatch(html, /<details class="lpa-footnote-details"[^>]*open/);
  assert.match(html, /class="[^"]*lpa-card-actions/);
  assert.match(html, /<section class="lpa-subsection[^"]*" aria-label="online.title"/);
  assert.equal((html.match(/<section class="lpa-update-panel/g) ?? []).length, 1);
  assert.match(html, /<details class="lpa-update-guide">/);
});

test("card CSS uses theme tokens, keyboard-visible real switches and a 720px single-column rule", () => {
  assert.match(css, /\.lpa-card\{[^}]*border-radius:12px/);
  assert.match(css, /\.lpa-switch\{[^}]*width:40px[^}]*height:22px/);
  assert.match(css, /\.lpa-switch:checked\{[^}]*var\(--dsw-alias-brand-primary\)/);
  assert.match(css, /focus-visible/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /\.lpa-stats,\.lpa-settings-cards\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.lpa-install-row[^}]*grid-template-columns:minmax\(0,1fr\) auto/);
  const cardRules = css.slice(css.indexOf("/* Settings card system"));
  assert.doesNotMatch(cardRules, /#[a-fA-F0-9]{3,8}\b|rgba?\(/);
});
