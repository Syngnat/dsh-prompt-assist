import React from "react";
import {createOnlineUpdateController, initialOnlineSnapshot, canForgetOnlineMarker} from "./online-update-state.js";
const h = React.createElement;

export function OnlineUpdatePanelContent({snapshot = initialOnlineSnapshot(), updateAvailable = false, t, onPrepare, onConfirm, onConsent, onDismiss, onReload, onRecoveryAcknowledged, onForgetMarker}) {
  const {data, preparation, pending, consent, localError, uncertain, recordLost, confirmationRejected, recoveryAcknowledged, markerCleared} = snapshot;
  const operation = data?.operation;
  const canForget = canForgetOnlineMarker(snapshot);
  const active = operation && !operation.terminal;
  const button = (key, onClick, disabled = false, emphasis = "") => h("button", {type: "button", className: "lpa-button" + emphasis, onClick, disabled}, t("online." + key));
  const field = (label, value) => h("div", {className: "lpa-update-field", key: label}, h("dt", null, t("online." + label)), h("dd", null, value));
  return h("section", {className: "lpa-update-panel", "aria-label": t("online.title"), "aria-busy": !!pending},
    h("h3", null, t("online.title")),
    updateAvailable && data?.available && !active && !pending && !uncertain && !recordLost && operation?.phase !== "unknown" ? h("div", {className: "lpa-update-banner", role: "status", "aria-live": "polite", "aria-atomic": true},
      h("span", {className: "lpa-update-badge"}, t("online.badge")),
      h("div", {className: "lpa-update-banner-copy"}, h("h4", null, t("online.availableTitle")), h("p", null, t("online.availableHint")))) : null,
    h("p", {className: "lpa-note"}, t("online.userOnly")),
    h("p", {className: "lpa-note"}, t("online.continuity")),
    operation && !uncertain ? h("div", {role: "status", "aria-live": "polite", "aria-atomic": true},
      h("p", null, t("online.phase." + operation.phase)),
      h("dl", {className: "lpa-update-versions"}, field("jobId", operation.jobId), field("fromVersion", operation.fromVersion), field("targetVersion", operation.targetVersion),
        field("installedVersion", operation.installedVersion ?? t("updates.unknown"))),
      operation.error ? h("p", {className: "lpa-error"}, t("online.errorCode"), " ", h("code", null, operation.error)) : null,
      operation.detailCode ? h("p", {className: "lpa-note"}, t("online.detailCode"), " ", h("code", null, operation.detailCode)) : null,
      operation.restartRequired ? h("p", {className: "lpa-note"}, t("online.restart")) : null,
      operation.cancelRequested ? h("p", {className: "lpa-note"}, t("online.cancelRequested")) : null) : null,
    !data && !localError && !markerCleared ? h("p", {role: "status"}, t("online.loading")) : null,
    data && !operation && !uncertain ? h("p", {className: "lpa-note"}, t("online.noRecord")) : null,
    data && !data.available ? h("p", {className: "lpa-note"}, t("online.unavailable"), data.reason ? " (" + data.reason + ")" : null) : null,
    recordLost || uncertain ? h("p", {className: "lpa-error", role: "alert"}, t(recordLost ? "online.recordLost" : "online.uncertain")) : null,
    localError ? h("p", {className: "lpa-error", role: "alert"}, t(confirmationRejected ? "online.confirmationRejected" : "online.requestFailed"), " ", h("code", null, localError)) : null,
    (recordLost || uncertain) ? h("div", {className: "lpa-update-install"},
      h("p", {className: "lpa-note"}, t("online.forgetWarning")),
      h("label", {className: "lpa-row"}, h("input", {type: "checkbox", checked: recoveryAcknowledged === true, disabled: !canForget,
        onChange: event => onRecoveryAcknowledged?.(event.target.checked)}), t("online.forgetAcknowledgement")),
      button("forgetMarker", onForgetMarker, !canForget || recoveryAcknowledged !== true)) : null,
    markerCleared ? h("p", {className: "lpa-note", role: "status"}, t("online.markerCleared")) : null,
    preparation ? h("div", {className: "lpa-update-review"},
      h("h4", null, t("online.review")),
      h("dl", {className: "lpa-update-versions"}, field("fromVersion", preparation.fromVersion), field("targetVersion", preparation.targetVersion),
        field("targetSpec", h("code", null, preparation.targetSpec)), field("restoreSpec", h("code", null, preparation.restoreSpec)),
        field("expiresAt", h("time", {dateTime: new Date(preparation.expiresAt).toISOString()}, new Date(preparation.expiresAt).toISOString()))),
      h("p", {className: "lpa-update-risk"}, t("online.risks")),
      h("fieldset", {className: "lpa-update-consent"}, h("legend", null, t("online.consentTitle")),
        h("label", {className: "lpa-row"}, h("input", {type: "checkbox", checked: consent, disabled: !!pending, onChange: event => onConsent?.(event.target.checked)}), t("online.consent"))),
      h("div", {className: "lpa-row"}, button("confirm", onConfirm, !consent || !!pending || uncertain, " lpa-button--primary lpa-button--danger"), button("dismiss", onDismiss, !!pending))) : null,
    h("div", {className: "lpa-row"},
      !preparation && updateAvailable ? button(pending === "prepare" ? "preparing" : "prepare", onPrepare, !!pending || !data?.available || !!active || uncertain, " lpa-button--primary") : null,
      button("reload", onReload, !!pending)),
    pending === "confirm" ? h("p", {role: "status"}, t("online.submitting")) : null);
}

export function OnlineUpdatePanel({t, updateAvailable, fetcher = globalThis.fetch}) {
  const controller = React.useMemo(() => createOnlineUpdateController(fetcher), [fetcher]);
  const snapshot = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  React.useEffect(() => {void controller.start(); return () => controller.dispose();}, [controller]);
  return h(OnlineUpdatePanelContent, {t, snapshot, updateAvailable,
    onPrepare: () => {void controller.prepare();}, onConfirm: () => {void controller.confirm();},
    onRecoveryAcknowledged: value => controller.setRecoveryAcknowledged(value), onForgetMarker: () => controller.forgetMarker(),
    onConsent: value => controller.setConsent(value), onDismiss: () => controller.dismiss(), onReload: () => {void controller.load();}});
}
