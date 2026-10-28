import React from "react";
import {createUpdateController, initialUpdateSnapshot, updateDisplay, INSTALL_SPEC, copyInstallSpec, displayCheckedAt} from "./update-state.js";
import {OnlineUpdatePanel} from "./online-update-panel.js";
import {createOnlineUpdateController} from "./online-update-state.js";
const h = React.createElement;

/** Pure render surface, exercised with ReactDOMServer rather than a fake DOM. */
export function UpdatePanelContent({snapshot = initialUpdateSnapshot(), t, onCheck, onReload, onCancel, onCopy, copyStatus, install = null, acknowledged = false, children}) {
  const view = updateDisplay(snapshot);
  const data = snapshot.data;
  const available = view.status === "update-available";
  const button = (key, onClick, disabled = false) => h("button", {type: "button", className: "lpa-button", onClick, disabled}, t(key));
  const field = (label, value, highlight = false) => h("div", {className: "lpa-update-field lpa-stat" + (highlight ? " lpa-update-field--highlight lpa-stat--highlight" : ""), key: label},
    h("dt", null, t(label)), h("dd", null, value));
  return h("section", {className: "lpa-update-panel lpa-card", "aria-label": t("updates.title")},
    h("header", {className: "lpa-card-header"}, h("h2", {className: "lpa-update-title lpa-card-title"}, t("settings.updatesSection")),
      h("p", {className: "lpa-note"}, t("updates.readOnly"))),
    h("dl", {className: "lpa-update-versions lpa-stats"},
      field("updates.installedVersion", data?.currentVersion ?? t("updates.unknown")),
      field("updates.latestVersion", data?.latestVersion ?? t("updates.unknown"), available),
      field("updates.checkedAt", view.checkedAt ? h("time", {dateTime: view.checkedAt}, displayCheckedAt(new Date(view.checkedAt).getTime()) ?? view.checkedAt) : t("updates.notChecked"))),
    available ? h("div", {className: "lpa-update-summary lpa-update-summary--available", role: "status", "aria-live": "polite", "aria-atomic": true},
      h("strong", null, t("updates.availableTitle")), h("p", null, t(view.message)), h("p", null, t("updates.availableHint"))) :
    h("p", {className: view.status === "error" ? "lpa-error" : "lpa-note",
      role: view.status === "error" ? "alert" : "status", "aria-live": "polite", "aria-atomic": true},
      t(view.message), view.status === "error" && view.error ? " " + t("updates.error." + view.error) : null),
    h("div", {className: "lpa-row lpa-card-actions"},
      // Once a newer stable release is known the primary action belongs here: installing from the
      // card avoids scrolling down to the online section just to start the same job.
      available && install ? h(React.Fragment, null,
        h("label", {className: "lpa-row lpa-update-consent-inline"},
          h("input", {type: "checkbox", checked: acknowledged === true, disabled: install.pending, onChange: event => install.onAcknowledge(event.target.checked)}),
          t("updates.installConsent")),
        h("button", {type: "button", className: "lpa-button lpa-button--primary", onClick: install.onInstall,
          disabled: !acknowledged || install.pending,
          // A disabled button is invisible feedback on its own: name the reason on the control too.
          title: !acknowledged && !install.pending ? t("updates.installNeedsConsent") : undefined},
          t(install.pending ? "updates.installing" : "updates.installNow"))) :
        button(snapshot.pending === "check" ? "updates.checkingButton" : "updates.checkButton", onCheck, snapshot.pending === "check"),
      snapshot.pending ? button("updates.cancel", onCancel) : null,
      snapshot.localError ? button("updates.reloadStatus", onReload) : null,
      view.releaseUrl ? h("a", {className: "lpa-button", href: view.releaseUrl, target: "_blank", rel: "noopener noreferrer"}, t("updates.releaseLink")) : null),
    // The primary action is disabled until consent is ticked, so the card has to say that out loud;
    // a refused/failed preparation must land here as well instead of returning silently.
    available && install && !acknowledged && !install.pending ? h("p", {className: "lpa-note lpa-install-hint", role: "status"}, t("updates.installNeedsConsent")) : null,
    available && install && install.error ? h("p", {className: "lpa-error", role: "alert"}, t("updates.installFailed"), " ", h("code", null, install.error)) : null,
    h("details", {className: "lpa-footnote-details"}, h("summary", null, t("settings.advanced")),
      h("p", {className: "lpa-note"}, t("updates.privacy")),
      h("p", {className: "lpa-note"}, t("updates.cacheNote"))),
    h("div", {className: "lpa-divider"}),
    children,
    h("div", {className: "lpa-update-install lpa-install-row"},
      h("span", null, t("updates.installAddress")), h("code", null, INSTALL_SPEC),
      button("updates.copy", onCopy), copyStatus ? h("span", {className: "lpa-note", role: "status"}, t("updates." + copyStatus)) : null),
    h("details", {className: "lpa-update-guide"}, h("summary", null, t("updates.manualUpgrade")),
      h("ol", null,
        h("li", null, t("updates.stepSave")),
        h("li", null, t("updates.stepRemove"), " ", h("code", null, "@local/dsh-openai-fast")),
        h("li", null, t("updates.stepInstall"), " ", h("code", null, INSTALL_SPEC)),
        h("li", null, t("updates.stepRestart"))),
      h("p", {className: "lpa-note"}, t("updates.backup"))));
}

export function UpdatePanel({t, fetcher = globalThis.fetch}) {
  const controller = React.useMemo(() => createUpdateController(fetcher), [fetcher]);
  const online = React.useMemo(() => createOnlineUpdateController(fetcher), [fetcher]);
  const snapshot = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const onlineSnapshot = React.useSyncExternalStore(online.subscribe, online.getSnapshot, online.getSnapshot);
  const [copyStatus, setCopyStatus] = React.useState(null);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const copyEpoch = React.useRef(0);
  React.useEffect(() => {
    void controller.start();
    void online.start();
    return () => {copyEpoch.current += 1; controller.dispose(); online.dispose();};
  }, [controller, online]);
  async function copy() {
    const revision = ++copyEpoch.current;
    try {
      await copyInstallSpec();
      if (copyEpoch.current === revision) setCopyStatus("copied");
    } catch {
      if (copyEpoch.current === revision) setCopyStatus("copyFailed");
    }
  }
  // The card runs the same prepare -> consent -> confirm sequence as the online section.
  async function install() {
    if (!acknowledged) return;
    await online.prepare();
    const live = online.getSnapshot();
    // A refused preparation leaves localError set; the card renders it, so the click is never silent.
    if (!live.preparation || live.uncertain || live.localError) return;
    online.setConsent(true);
    await online.confirm();
  }
  const operation = onlineSnapshot.data?.operation;
  const installPending = onlineSnapshot.pending !== null || Boolean(operation && !operation.terminal);
  return h(UpdatePanelContent, {snapshot, t, copyStatus, onCopy: copy, acknowledged,
    install: {pending: installPending, error: onlineSnapshot.localError, onAcknowledge: setAcknowledged, onInstall: () => {void install();}},
    onCheck: () => {void controller.check();}, onReload: () => {void controller.load();}, onCancel: () => controller.cancel()},
    h(OnlineUpdatePanel, {t, fetcher, controller: online, snapshot: onlineSnapshot,
      currentVersion: snapshot.data?.currentVersion ?? null,
      // The enclosing card already announces the available release and carries the install action.
      showAvailability: false, showInstall: false,
      updateAvailable: snapshot.data?.status === "update-available"}));
}
