import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {UpdatePanelContent} from "../assist/client/update-panel.js";

const h = React.createElement;
const t = key => key;
const available = {
  data: {
    status: "update-available", currentVersion: "1.3.1", latestVersion: "1.3.2",
    releaseUrl: "https://github.com/Syngnat/dsh-prompt-assist/releases/tag/v1.3.2", checkedAt: 1793200000000,
  },
  pending: null, localError: null, cancelled: false,
};
const install = overrides => ({pending: false, error: null, onAcknowledge() {}, onInstall() {}, ...overrides});
const render = props => renderToStaticMarkup(h(UpdatePanelContent,
  {snapshot: available, t, onCheck() {}, onReload() {}, onCancel() {}, onCopy() {}, copyStatus: null, install: install(), ...props}));

// A disabled button is the whole feedback for a click, so the card must spell out the reason
// instead of leaving the row looking broken.
test("the install button names the reason it is disabled", () => {
  const locked = render({acknowledged: false});
  assert.match(locked, /updates\.installNeedsConsent/);
  const button = (locked.match(/<button[^>]*>updates\.installNow<\/button>/) ?? [])[0];
  assert.ok(button, "the install button must render while an update is available");
  assert.match(button, /disabled=""/);
  assert.match(button, /title="updates\.installNeedsConsent"/);

  const ready = render({acknowledged: true});
  assert.doesNotMatch(ready, /updates\.installNeedsConsent/);
  assert.doesNotMatch(ready, /<button[^>]*title=/);
  assert.match(ready, /<button[^>]*>updates\.installNow<\/button>/);
});

// prepare() can refuse (network, rate limit, unsupported source); that used to return silently.
test("a preparation failure is reported inside the card", () => {
  const html = render({acknowledged: true, install: install({error: "network"})});
  assert.match(html, /updates\.installFailed/);
  assert.match(html, /<code>network<\/code>/);
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(render({acknowledged: true}), /updates\.installFailed/);
});
