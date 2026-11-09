import React from "react";
import {EMPTY_ENABLEMENT_SOURCE} from "./enablement-source.js";
const h=React.createElement;
export function EnablementPanelContent({snapshot,t,onSet,onReload,onFinalAnswer,onProcessFeedback}){
 const {data,connected,loading,pending,readError,writeError,saved}=snapshot;
 const disabled=!data||!connected||!!pending;
 const message=writeError==="stale-enablement"?"global.stale":writeError?"global.saveFailed":readError?"global.disconnected":null;
 const savedRevision=saved?.feature==="final-answer"?data?.finalAnswerRevision:saved?.feature==="process-feedback"?data?.processFeedbackRevision:data?.revision;
 const showSaved=!!saved&&connected&&!writeError&&saved.revision===savedRevision;
 return h("section",{className:"lpa-feature lpa-card","aria-label":t("global.title"),"aria-busy":!!pending},
  h("header",{className:"lpa-card-header"},h("h2",{className:"lpa-feature-title lpa-card-title"},t("settings.globalSection")),
   h("p",{className:"lpa-note"},t("global.scope"))),
  h("div",{className:"lpa-row lpa-switches"},["suggest","enhance"].map(feature=>h("label",{className:"lpa-check lpa-switch-row",key:feature},
   h("span",{className:"lpa-switch-copy"},h("strong",null,t("global."+feature)),h("span",{className:"lpa-note"},t("global."+feature+"Hint"))),
   h("input",{className:"lpa-switch",type:"checkbox",checked:data?.enabled[feature]===true,disabled,onChange:event=>onSet(feature,event.target.checked)})))),
  // Profile-wide prompt switches: they ride the injected reminders, not a model call.
  h("label",{className:"lpa-check lpa-switch-row",key:"final-answer"},
   h("span",{className:"lpa-switch-copy"},h("strong",null,t("global.finalAnswer")),h("span",{className:"lpa-note"},t("global.finalAnswerHint"))),
   h("input",{className:"lpa-switch",type:"checkbox",checked:data?.finalAnswer!==false,disabled,onChange:event=>onFinalAnswer?.(event.target.checked)})),
  h("label",{className:"lpa-check lpa-switch-row",key:"process-feedback"},
   h("span",{className:"lpa-switch-copy"},h("strong",null,t("global.processFeedback")),h("span",{className:"lpa-note"},t("global.processFeedbackHint"))),
   h("input",{className:"lpa-switch",type:"checkbox",checked:data?.processFeedback!==false,disabled,onChange:event=>onProcessFeedback?.(event.target.checked)})),
  pending?h("p",{role:"status"},t("global.saving")):null,
  !connected&&!message?h("p",{role:"status",className:"lpa-note"},t(loading?"global.loading":"global.disconnected")):null,
  message?h("p",{role:"alert",className:"lpa-error"},t(message)):null,
  showSaved?h("p",{role:"status",className:"lpa-note"},t("global.saved")):null,
  (!connected||readError||writeError)?h("div",{className:"lpa-card-actions"},h("button",{type:"button",className:"lpa-button",onClick:onReload,disabled:!!pending||loading},t("global.reload"))):null,
  h("div",{className:"lpa-footnote"},h("p",{className:"lpa-note"},t("global.charge")),h("p",{className:"lpa-note"},t("global.migration"))));
}
export function EnablementPanel({globalSource=EMPTY_ENABLEMENT_SOURCE,t}){
 const snapshot=React.useSyncExternalStore(globalSource.subscribe,globalSource.getSnapshot,globalSource.getSnapshot);
 return h(EnablementPanelContent,{snapshot,t,onSet:(feature,value)=>{void globalSource.setEnabled(feature,value);},
  onFinalAnswer:value=>{void globalSource.setFinalAnswer?.(value);},
  onProcessFeedback:value=>{void globalSource.setProcessFeedback?.(value);},onReload:()=>{void globalSource.load();}});
}
