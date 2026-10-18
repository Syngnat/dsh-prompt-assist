import React from "react";
import {createUpdateController, initialUpdateSnapshot, updateDisplay, INSTALL_SPEC, copyInstallSpec} from "./update-state.js";
import {OnlineUpdatePanel} from "./online-update-panel.js";
const h = React.createElement;

/** Pure render surface, exercised with ReactDOMServer rather than a fake DOM. */
export function UpdatePanelContent({snapshot = initialUpdateSnapshot(), t, onCheck, onReload, onCancel, onCopy, copyStatus, children}) {
  const view = updateDisplay(snapshot);
  const data = snapshot.data;
  const button = (key, onClick, disabled = false) => h("button", {type: "button", className: "lpa-button", onClick, disabled}, t(key));
  const field = (label, value) => h("div", {className: "lpa-update-field", key: label},
    h("dt", null, t(label)), h("dd", null, value));
  return h("section", {className: "lpa-update-panel", "aria-label": t("updates.title")},
    h("h2", {className: "lpa-update-title"}, t("updates.title")),
    h("p", {className: "lpa-note"}, t("updates.readOnly")),
    h("dl", {className: "lpa-update-versions"},
      field("updates.installedVersion", data?.currentVersion ?? t("updates.unknown")),
      field("updates.latestVersion", data?.latestVersion ?? t("updates.unknown")),
      field("updates.checkedAt", view.checkedAt ? h("time", {dateTime: view.checkedAt}, view.checkedAt) : t("updates.notChecked"))),
    h("p", {className: view.status === "error" ? "lpa-error" : "lpa-note",
      role: view.status === "error" ? "alert" : "status", "aria-live": "polite", "aria-atomic": true},
      t(view.message), view.status === "error" && view.error ? " " + t("updates.error." + view.error) : null),
    h("div", {className: "lpa-row"},
      button(snapshot.pending === "check" ? "updates.checkingButton" : "updates.checkButton", onCheck, snapshot.pending === "check"),
      snapshot.pending ? button("updates.cancel", onCancel) : null,
      snapshot.localError ? button("updates.reloadStatus", onReload) : null,
      view.releaseUrl ? h("a", {className: "lpa-button", href: view.releaseUrl, target: "_blank", rel: "noopener noreferrer"}, t("updates.releaseLink")) : null),
    h("p", {className: "lpa-note"}, t("updates.privacy")),
    h("p", {className: "lpa-note"}, t("updates.cacheNote")),
    children,
    h("div", {className: "lpa-update-install"},
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
    h(OnlineUpdatePanel, {t, fetcher, updateAvailable: snapshot.data?.status === "update-available"}));
}
