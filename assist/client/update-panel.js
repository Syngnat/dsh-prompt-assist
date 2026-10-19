import React from "react";
import {createUpdateController, initialUpdateSnapshot, updateDisplay, INSTALL_SPEC, copyInstallSpec, displayCheckedAt} from "./update-state.js";
import {OnlineUpdatePanel} from "./online-update-panel.js";
const h = React.createElement;

/** Pure render surface, exercised with ReactDOMServer rather than a fake DOM. */
export function UpdatePanelContent({snapshot = initialUpdateSnapshot(), t, onCheck, onReload, onCancel, onCopy, copyStatus, children}) {
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
      button(snapshot.pending === "check" ? "updates.checkingButton" : "updates.checkButton", onCheck, snapshot.pending === "check"),
      snapshot.pending ? button("updates.cancel", onCancel) : null,
      snapshot.localError ? button("updates.reloadStatus", onReload) : null,
      view.releaseUrl ? h("a", {className: "lpa-button", href: view.releaseUrl, target: "_blank", rel: "noopener noreferrer"}, t("updates.releaseLink")) : null),
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
  const snapshot = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [copyStatus, setCopyStatus] = React.useState(null);
  const copyEpoch = React.useRef(0);
  React.useEffect(() => {
    void controller.start();
    return () => {copyEpoch.current += 1; controller.dispose();};
  }, [controller]);
  async function copy() {
    const revision = ++copyEpoch.current;
    try {
      await copyInstallSpec();
      if (copyEpoch.current === revision) setCopyStatus("copied");
    } catch {
      if (copyEpoch.current === revision) setCopyStatus("copyFailed");
    }
  }
  return h(UpdatePanelContent, {snapshot, t, copyStatus, onCopy: copy,
    onCheck: () => {void controller.check();}, onReload: () => {void controller.load();}, onCancel: () => controller.cancel()},
    h(OnlineUpdatePanel, {t, fetcher, currentVersion: snapshot.data?.currentVersion ?? null,
      // The enclosing card already announces the available release; the subsection must not repeat it.
      showAvailability: false,
      updateAvailable: snapshot.data?.status === "update-available"}));
}
