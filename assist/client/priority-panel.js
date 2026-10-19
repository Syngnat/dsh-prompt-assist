import React from "react";
import {ASSIST_CHANNEL} from "../identity.js";
import {isOpenAIModel} from "../../policy.js";
const h = React.createElement;
const ENDPOINT = "local-openai-fast.priority";
const PROVIDER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const providerIds = values => Array.isArray(values) ? [...new Set(values.filter(value => typeof value === "string" && PROVIDER.test(value)))] : [];

/** UI admission is a second guard; registered/model eligibility remains Host-enforced. */
function availableCandidates(candidates, state) {
  const excluded = new Set([...providerIds(state?.configured), ...providerIds(state?.authorized)]);
  const seen = new Set();
  return (Array.isArray(candidates) ? candidates : []).flatMap(item => {
    if (!item || typeof item.id !== "string" || !PROVIDER.test(item.id) || item.configured !== false
      || excluded.has(item.id) || seen.has(item.id) || !Array.isArray(item.openAIModels)) return [];
    const openAIModels = item.openAIModels.filter(model => typeof model === "string" && isOpenAIModel(model)).slice(0, 8);
    if (!openAIModels.length) return [];
    seen.add(item.id);
    return [{id: item.id, configured: false, name: typeof item.name === "string" ? item.name : item.id, openAIModels}];
  });
}

export function PriorityPanelContent({state, candidates = [], consent = false, notice, pending, t,
  onConsent, onAuthorize, onRevoke, onReload, selected = "", onSelect}) {
  const configured = providerIds(state?.configured);
  const authorized = providerIds(state?.authorized).filter(id => !configured.includes(id));
  const available = availableCandidates(candidates, state);
  const selection = available.find(item => item.id === selected);
  const button = (key, action, disabled = false, extra = {}) => h("button",
    {type: "button", className: "lpa-button", onClick: action, disabled, ...extra}, t(key));
  return h("section", {className: "lpa-feature", "aria-label": t("priority.title"), "aria-busy": Boolean(pending)},
    h("h3", {className: "lpa-feature-title"}, t("priority.title")),
    h("p", {className: "lpa-note"}, t("priority.scope")),
    h("div", {className: "lpa-field"}, h("strong", null, t("priority.configured")),
      configured.map(id => h("p", {className: "lpa-note", key: id}, h("code", null, id)))),
    h("div", {className: "lpa-field"}, h("strong", null, t("priority.authorized")),
      authorized.map(id => h("div", {className: "lpa-row", key: id}, h("code", null, id),
        button("priority.revoke", () => onRevoke?.(id), !state || Boolean(pending), {"aria-label": t("priority.revoke") + ": " + id}))),
      state && !authorized.length ? h("p", {className: "lpa-note"}, t("priority.none")) : null),
    h("label", {className: "lpa-field"}, t("priority.candidates"),
      h("select", {value: selection?.id ?? "", disabled: !state || Boolean(pending) || !available.length,
        onChange: event => onSelect?.(event.target.value)},
        h("option", {value: ""}, t("priority.candidates")),
        available.map(item => h("option", {key: item.id, value: item.id}, item.name + " (" + item.id + ")")))),
    state && !available.length ? h("p", {className: "lpa-note"}, t("priority.noCandidates")) : null,
    selection ? h("p", {className: "lpa-note"}, t("priority.exampleModels"), ": ", selection.openAIModels.join(", ")) : null,
    h("label", {className: "lpa-check"}, h("input", {type: "checkbox", checked: consent === true,
      disabled: !state || Boolean(pending), onChange: event => onConsent?.(event.target.checked)}), t("priority.consent")),
    h("div", {className: "lpa-row"},
      button("priority.authorize", () => onAuthorize?.(selected, consent), !state || Boolean(pending) || consent !== true || !selection),
      button("priority.reload", () => onReload?.(), Boolean(pending))),
    pending || (!state && !notice) ? h("p", {className: "lpa-note", role: "status"}, t("priority.loading")) : null,
    notice ? h("p", {className: notice === "priority.error" ? "lpa-error" : "lpa-note", role: "status"}, t(notice)) : null);
}

function readState(value) {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0) throw {code: "invalid-response"};
  for (const key of ["configured", "authorized", "effective"]) {
    if (!Array.isArray(value[key]) || value[key].some(id => typeof id !== "string" || !PROVIDER.test(id))) throw {code: "invalid-response"};
  }
  return Object.freeze({revision: value.revision, configured: Object.freeze([...value.configured]),
    authorized: Object.freeze([...value.authorized]), effective: Object.freeze([...value.effective])});
}
const notices = Object.freeze({
  "consent-required": "priority.noConsent", "provider-unknown": "priority.unknownProvider",
  "provider-not-openai": "priority.refused", "invalid-provider": "priority.refused",
  "configured-provider": "priority.refused",
});
const noticeFor = code => typeof code === "string" && Object.hasOwn(notices, code) ? notices[code] : "priority.error";

export function createPriorityController(connection, {onChanged} = {}) {
  let snapshot = {state: null, candidates: [], pending: null, notice: null};
  let active = false, epoch = 0, flight = null;
  const listeners = new Set();
  const publish = patch => {snapshot = {...snapshot, ...patch}; listeners.forEach(listener => listener());};
  const stop = () => {epoch += 1; flight?.abort(); flight = null;};
  async function rpc(payload, signal) {
    const result = await connection.rpc.call(ASSIST_CHANNEL, ENDPOINT, payload, signal);
    if (signal.aborted) throw {code: "cancelled"};
    if (result?.ok !== true) throw {code: result?.error?.code};
    return result.value;
  }
  async function read(signal) {
    readState(await rpc({action: "snapshot"}, signal));
    const value = await rpc({action: "candidates"}, signal);
    const state = readState(value);
    if (!Array.isArray(value.candidates)) throw {code: "invalid-response"};
    return {state, candidates: availableCandidates(value.candidates, null)};
  }
  async function run(action, input = {}) {
    if (!active || snapshot.pending) return false;
    stop(); const token = epoch, abort = new AbortController(); flight = abort;
    const valid = () => active && epoch === token && !abort.signal.aborted;
    publish({pending: action, notice: null});
    try {
      if (action === "load") {
        const loaded = await read(abort.signal);
        if (!valid()) return false;
        publish({...loaded, notice: null});
      } else {
        const value = await rpc({action, ...input}, abort.signal);
        const state = readState(value);
        if (!valid()) return false;
        publish({state, notice: "priority.saved"});
        if (valid()) {try {Promise.resolve(onChanged?.()).catch(() => {});} catch {}}
      }
      return true;
    } catch (error) {
      if (!valid()) return false;
      if (error?.code === "stale-revision") {
        try {
          const loaded = await read(abort.signal);
          if (valid()) publish({...loaded, notice: "priority.stale"});
        } catch {if (valid()) publish({state: null, candidates: [], notice: "priority.error"});}
      } else publish({...(action === "load" ? {state: null, candidates: []} : {}), notice: noticeFor(error?.code)});
      return false;
    } finally {if (valid()) {flight = null; publish({pending: null});}}
  }
  const ready = () => active && !snapshot.pending && snapshot.state !== null;
  return {
    subscribe(listener) {listeners.add(listener); return () => listeners.delete(listener);},
    getSnapshot: () => snapshot,
    start() {if (!active) {active = true; publish({pending: null});} return run("load");},
    reload() {return run("load");},
    authorize(provider, consent) {
      if (!ready()) return Promise.resolve(false);
      if (consent !== true) {publish({notice: "priority.noConsent"}); return Promise.resolve(false);}
      if (!availableCandidates(snapshot.candidates, snapshot.state).some(item => item.id === provider)) {
        publish({notice: "priority.refused"}); return Promise.resolve(false);
      }
      return run("authorize", {provider, consent: true, expectedRevision: snapshot.state.revision});
    },
    revoke(provider) {
      if (!ready()) return Promise.resolve(false);
      if (!snapshot.state.authorized.includes(provider) || snapshot.state.configured.includes(provider)) {
        publish({notice: "priority.refused"}); return Promise.resolve(false);
      }
      return run("revoke", {provider, expectedRevision: snapshot.state.revision});
    },
    dispose() {active = false; stop();},
  };
}

export function PriorityPanel({connection, t, onChanged}) {
  const changed = React.useRef(onChanged); changed.current = onChanged;
  const controller = React.useMemo(() => createPriorityController(connection, {onChanged: () => changed.current?.()}), [connection]);
  const snapshot = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [selected, setSelected] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  React.useEffect(() => {void controller.start(); return () => controller.dispose();}, [controller]);
  React.useEffect(() => {setConsent(false);}, [snapshot.state?.revision, snapshot.notice]);
  React.useEffect(() => {
    if (selected && !availableCandidates(snapshot.candidates, snapshot.state).some(item => item.id === selected)) {
      setSelected(""); setConsent(false);
    }
  }, [snapshot.candidates, snapshot.state, selected]);
  return h(PriorityPanelContent, {...snapshot, consent, selected, t,
    onSelect: value => {setSelected(value); setConsent(false);}, onConsent: value => setConsent(value === true),
    onAuthorize: (provider, confirmed) => {void controller.authorize(provider, confirmed);},
    onRevoke: provider => {void controller.revoke(provider);},
    onReload: () => {setConsent(false); void controller.reload();}});
}
