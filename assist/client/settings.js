import React from "react";
import { validateSettings,sessionSettings } from "./api.js";
const h = React.createElement;
export function Settings(p) {
 const {t,config:v,catalog:c,capabilities:cap}=p;
 const change = patch => p.onChange({...v,...patch});
 const field=(key,node)=>h("label",{className:"lpa-field"},t(key),node);
 const check=(key,checked,change,disabled=false)=>h("label",{className:"lpa-check"},h("input",{type:"checkbox",checked,disabled,onChange:e=>change(e.target.checked)}),t(key));
 const [custom,setCustom]=React.useState(![1,3,5].includes(v.rounds));
 const [error,setError]=React.useState(null);
 const efforts=cap?.efforts??[];
 const invalidEffort=!v.followSession&&cap&&v.reasoningEffort&&!efforts.some(e=>e.id===v.reasoningEffort);
 const invalidFast=cap&&v.fast&&!cap.fastEligible;
 const submit=e=>{e.preventDefault();const problem=validateSettings(v);setError(problem==="rounds"?"roundsError":problem?"modelError":null);if(!problem&&!invalidEffort&&!invalidFast)p.save(sessionSettings(v));};
 const select=(key,value,items,change)=>field(key,h("select",{value,onChange:e=>change(e.target.value)},items.map(item=>h("option",{key:item.id,value:item.id},item.name))));
 return h("form",{onSubmit:submit},
 h("div",{className:"lpa-row"},check("follow",v.followSession,followSession=>change({followSession}))),
 h("p",{className:"lpa-note"},t("followHint")),
  h("p",{className:"lpa-note"},t("budgetPolicy")),
 !v.followSession?h("div",{className:"lpa-grid"},
 select("provider",v.provider,[{id:"",name:t("selectProvider")},...c.providers],provider=>change({provider,model:""})),
 select("model",v.model,[{id:"",name:t("selectModel")},...c.models.filter(m=>m.provider===v.provider)],model=>change({model})),
 select("effort",v.reasoningEffort,[{id:"",name:t("nativeDefault")},...(invalidEffort?[{id:v.reasoningEffort,name:v.reasoningEffort}]:[]),...efforts],reasoningEffort=>change({reasoningEffort}))):null,
 invalidEffort?h("p",{className:"lpa-error",role:"alert"},t("effortInvalid")):null,
 check("fast",v.fast,fast=>change({fast}),!v.fast&&cap?.fastEligible!==true),
 invalidFast?h("p",{className:"lpa-error",role:"alert"},t("fastUnsupported")):null,
 h("div",{className:"lpa-grid"},select("rounds",custom?"custom":String(v.rounds),[1,3,5].map(n=>({id:String(n),name:n})).concat({id:"custom",name:t("custom")}),value=>{setCustom(value==="custom");if(value!=="custom")change({rounds:Number(value)});}),
 custom?field("custom",h("input",{type:"number",min:1,max:20,step:1,value:Number.isFinite(v.rounds)?v.rounds:"",onChange:e=>change({rounds:e.target.value===""?NaN:Number(e.target.value)})})):null),
 error?h("p",{role:"alert",className:"lpa-error"},t(error)):null,
 h("button",{className:"lpa-button lpa-button--primary",type:"submit",disabled:p.saving||!p.allowed},t(p.saving?"saving":"save")));
}
