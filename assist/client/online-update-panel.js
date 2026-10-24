import React from "react";
import {createOnlineUpdateController, initialOnlineSnapshot, canForgetOnlineMarker} from "./online-update-state.js";
import {displayUtcTime} from "./update-state.js";
const h = React.createElement;

export function OnlineUpdatePanelContent({snapshot = initialOnlineSnapshot(), updateAvailable = false, currentVersion = null, showAvailability = true, showInstall = true, t, acknowledged = false, onAcknowledge, onInstall, onConfirm, onConsent, onDismiss, onReload, onRecoveryAcknowledged, onForgetMarker}) {
  const {data, preparation, pending, consent, localError, uncertain, recordLost, confirmationRejected, recoveryAcknowledged, markerCleared} = snapshot;
  const operation = data?.operation;
  const canForget = canForgetOnlineMarker(snapshot);
  const active = operation && !operation.terminal;
  // A terminal record that predates the running version is history, not the current state.
  const staleRecord = Boolean(currentVersion && operation?.terminal && operation?.installedVersion && operation.installedVersion !== currentVersion);
  const button = (key, onClick, disabled = false, emphasis = "") => h("button", {type: "button", className: "lpa-button" + emphasis, onClick, disabled}, t("online." + key));
  const field = (label, value) => h("div", {className: "lpa-update-field", key: label}, h("dt", null, t("online." + label)), h("dd", null, value));
  const operationFields = () => h("dl", {className: "lpa-update-versions"}, field("jobId", operation.jobId), field("taskFrom", operation.fromVersion), field("taskTarget", operation.targetVersion),
    field("installedVersion", operation.installedVersion ?? t("updates.unknown")),
    currentVersion ? field("runningVersion", currentVersion) : null);
  const operationNotes = () => [
    operation.error ? h("p", {className: "lpa-error", key: "error"}, t("online.errorCode"), " ", h("code", null, operation.error)) : null,
    operation.detailCode ? h("p", {className: "lpa-note", key: "detail"}, t("online.detailCode"), " ", h("code", null, operation.detailCode)) : null,
    operation.restartRequired ? h("p", {className: "lpa-note", key: "restart"}, t("online.restart")) : null,
    operation.cancelRequested ? h("p", {className: "lpa-note", key: "cancel"}, t("online.cancelRequested")) : null];
  return h("section", {className: "lpa-subsection lpa-online-update", "aria-label": t("online.title"), "aria-busy": !!pending},
    h("h3", {className: "lpa-subsection-title"}, t("online.title")),
    showAvailability && updateAvailable && data?.available && !active && !pending && !uncertain && !recordLost && operation?.phase !== "unknown" ? h("div", {className: "lpa-update-banner", role: "status", "aria-live": "polite", "aria-atomic": true},
      h("span", {className: "lpa-update-badge"}, t("online.badge")),
      h("div", {className: "lpa-update-banner-copy"}, h("h4", null, t("online.availableTitle")), h("p", null, t("online.availableHint")))) : null,
    h("p", {className: "lpa-note"}, t("online.userOnly")),
    h("p", {className: "lpa-note"}, t("online.continuity")),
    operation && !uncertain && staleRecord ? h("details", {className: "lpa-update-history"},
      h("summary", null, t("online.history"), ": ", h("code", null, operation.fromVersion), " → ", h("code", null, operation.targetVersion),
        operation.installedVersion ? " · " + t("online.installedVersion") + " " + operation.installedVersion : "",
        currentVersion ? " · " + t("online.runningVersion") + " " + currentVersion : ""),
      h("p", {className: "lpa-note"}, t("online.recordStale")),
      h("p", {className: "lpa-note"}, t("online.phase." + operation.phase)),
      operationFields(), operationNotes()) : null,
    operation && !uncertain && !staleRecord ? h("div", {role: "status", "aria-live": "polite", "aria-atomic": true},
      h("p", null, t("online.phase." + operation.phase)),
      operationFields(), operationNotes()) : null,
    !data && !localError && !markerCleared ? h("p", {role: "status"}, t("online.loading")) : null,
    data && !operation && !uncertain ? h("p", {className: "lpa-note"}, t("online.noRecord")) : null,
    data && !data.available ? h(React.Fragment, null,
      h("p", {className: "lpa-note"}, t("online.unavailable"), data.reason ? " (" + data.reason + ")" : null,
        data.source ? h(React.Fragment, null, " · " + t("online.sourceObserved") + ": ", h("code", null, data.source)) : null),
      data.reason === "unsupported-source" ? h("p", {className: "lpa-note"}, t("online.unsupportedSourceHint")) : null) : null,
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
        field("expiresAt", h("time", {dateTime: new Date(preparation.expiresAt).toISOString()}, displayUtcTime(preparation.expiresAt)))),
      h("p", {className: "lpa-update-risk"}, t("online.risks")),
      h("fieldset", {className: "lpa-update-consent"}, h("legend", null, t("online.consentTitle")),
        h("label", {className: "lpa-row"}, h("input", {type: "checkbox", checked: consent, disabled: !!pending, onChange: event => onConsent?.(event.target.checked)}), t("online.consent"))),
      h("div", {className: "lpa-row lpa-card-actions"}, button("confirm", onConfirm, !consent || !!pending || uncertain, " lpa-button--primary lpa-button--danger"), button("dismiss", onDismiss, !!pending))) : null,
    h("div", {className: "lpa-row lpa-card-actions"},
      showInstall && !preparation && updateAvailable && data?.available && !active ? h(React.Fragment, null,
        h("p", {className: "lpa-note"}, t("online.risks")),
        h("label", {className: "lpa-row"}, h("input", {type: "checkbox", checked: acknowledged === true, disabled: !!pending,
          onChange: event => onAcknowledge?.(event.target.checked)}), t("online.installConsent")),
        button(pending ? "installing" : "installNow", onInstall, !!pending || !acknowledged || uncertain, " lpa-button--primary")) : null,
      button("reload", onReload, !!pending)),
    pending === "confirm" ? h("p", {role: "status"}, t("online.submitting")) : null);
}

export function OnlineUpdatePanel({t, updateAvailable, currentVersion = null, showAvailability = true, showInstall = true, fetcher = globalThis.fetch, controller: external = null}) {
  const controller = React.useMemo(() => external ?? createOnlineUpdateController(fetcher), [external, fetcher]);
  const snapshot = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [acknowledged, setAcknowledged] = React.useState(false);
  // An owning card starts and disposes the controller; a standalone mount owns its own.
  React.useEffect(() => {
    if (external) return;
    void controller.start();
    return () => controller.dispose();
  }, [controller, external]);
  // One explicit submission: consent is the checkbox, and the click runs prepare -> consent -> confirm.
  // A failed prepare or confirm still lands in the review block, where the manual buttons remain.
  const install = async () => {
    await controller.prepare();
    const live = controller.getSnapshot();
    if (!live.preparation || live.uncertain || live.localError) return;
    controller.setConsent(true);
    await controller.confirm();
  };
  return h(OnlineUpdatePanelContent, {t, snapshot, updateAvailable, currentVersion, showAvailability, showInstall, acknowledged,
    onAcknowledge: setAcknowledged, onInstall: () => {void install();}, onConfirm: () => {void controller.confirm();},
    onRecoveryAcknowledged: value => controller.setRecoveryAcknowledged(value), onForgetMarker: () => controller.forgetMarker(),
    onConsent: value => controller.setConsent(value), onDismiss: () => controller.dismiss(), onReload: () => {void controller.load();}});
}
