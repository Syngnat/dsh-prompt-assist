import { triggerStatusKey } from './trigger-status.js';
import { canSuggest } from './editor.js';
import React from "react";
import {useModelOptions} from "./runtime.js";
import {Settings} from "./settings.js";
import {Preview} from "./preview.js";
import {errorKey} from "./api.js";
import {ownsResult} from "./editor.js";
const h=React.createElement;

export function FeatureCard({feature,runtime:r,config,open,actions,t,onChange,onSave,onApplied,undo,onUndo,children}) {
  const options=useModelOptions(r,feature,config,open);
  const preview=r.result.preview?.feature===feature;
  const pending=r.result.pending===feature;
  const ownedUndo=undo?.feature===feature&&ownsResult(undo,r.sessionId)
    &&r.input.draft===undo.original&&r.input.draftRev===undo.draftRev;
  if(!open&&!preview&&!pending&&!ownedUndo)return null;
  const button=(key,onClick,disabled=false)=>h("button",{type:"button",className:"lpa-button",onClick,disabled},t(key));
  return h("section",{className:"lpa-feature","aria-label":t(feature),"data-assist-feature":feature},
    h("h3",{className:"lpa-feature-title"},t(feature)),
    open?h("p",{className:"lpa-note"},t(feature==="suggest"?"suggestContext":"enhanceOriginal")):null,
    open&&r.state?h(Settings,{t,config,catalog:options.catalog,capabilities:options.capabilities,
      allowed:r.allowed,saving:r.saving,onChange,save:onSave}):null,
    open&&options.error?h("p",{className:"lpa-error",role:"status"},t(errorKey(options.error))):null,
    open?children:null,
    open&&feature==='suggest'?h('div',{className:'lpa-feature-actions'},
      h('p',{className:'lpa-note'},t(!r.settings.suggest.enabled?'suggestDisabled':r.busy?'busy':!canSuggest(r.input)?'draftOccupied':triggerStatusKey(r.result.trigger?.reason))),
      button('generateSuggest',()=>r.controller.generate('suggest'),!r.allowed||r.busy||r.dirty||!r.settings.suggest.enabled||!canSuggest(r.input)||!r.state?.qaCount||Boolean(r.result.pending))):null,
    pending?h("div",{className:"lpa-row",role:"status"},t("generating"),button("cancel",()=>r.controller.cancel())):null,
    preview?h(Preview,{runtime:r,actions,t,onApplied:value=>onApplied({...value,feature})}):null,
    ownedUndo?button("undo",onUndo,!r.allowed):null);
}
