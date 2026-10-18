import {compactPanelModifier} from './result-layout.js';
import React from 'react';
import {enhanceAvailability,suggestAvailability} from './enhance-action.js';
import {shouldShowPanel} from './panel-visibility.js';
import {useAssistRuntime} from './runtime.js';
import {Preview,NoSuggestion} from './preview.js';
import {SelectedFiles} from './selected-files.js';
import {undoText,ownsResult} from './editor.js';
import {errorKey} from './api.js';
import {css} from './style.js';
const h=React.createElement;
export function AssistPanel(p){
 const r=useAssistRuntime(p),t=p.t;
 const [files,setFiles]=React.useState({}),[undo,setUndo]=React.useState(null);
 React.useEffect(()=>{if(!r.session?.subagent&&!r.session?.removed)p.settingsTarget.select(p.sessionId);},[p.settingsTarget,p.sessionId,r.session?.subagent,r.session?.removed]);
 React.useEffect(()=>()=>{p.assistEnhance.clear();p.assistSuggest.clear();},[p.assistEnhance,p.assistSuggest]);
 React.useEffect(()=>{
  p.assistEnhance.update(enhanceAvailability(r),()=>r.controller.generate('enhance',Object.values(files).filter(Boolean)));
  p.assistSuggest.update(suggestAvailability(r),()=>r.controller.generate('suggest'));
 },[p.assistEnhance,p.assistSuggest,r.controller,r.allowed,r.state,r.settings,r.dirty,r.busy,r.input,r.result.pending,files]);
 React.useEffect(()=>{setFiles({});},[p.sessionId,r.input.draftRev]);
 React.useEffect(()=>{setUndo(null);},[p.sessionId]);
 const visible=shouldShowPanel({open:false,result:r.result,undo,input:r.input,sessionId:p.sessionId});
 if(r.session?.subagent||r.session?.removed||(!visible&&!r.input.occurrences.length))return null;
 const button=(key,onClick,disabled=false)=>h('button',{type:'button',className:'lpa-button',onClick,disabled},t(key));
 const validUndo=ownsResult(undo,p.sessionId)&&r.input.draft===undo.original&&r.input.draftRev===undo.draftRev;
 const undoApply=()=>{const result=undoText(undo,r.readInput,p.inputActions);if(result.ok)setUndo(null);else r.setNotice(result.reason);};
 const dismiss=()=>{r.controller.dismiss();r.setNotice(null);};
 const notice=r.result.error??r.notice;
 return h('section',{className:'lpa lpa-inline'+compactPanelModifier({pending:r.result.pending,preview:r.result.preview,referenceCount:r.input.occurrences.length,notice,validUndo}),'aria-label':t('preview')},h('style',null,css),
  h(SelectedFiles,{input:r.input,files,t,onChange:(key,entry)=>{r.controller.dismiss();setFiles(old=>({...old,[key]:entry}));}}),
  r.result.pending&&!r.result.preview?h('div',{className:'lpa-row lpa-pending',role:'status'},h('span',{className:'lpa-pending-mark','aria-hidden':true}),t(r.result.pending==='suggest'?'generatingSuggest':'generating'),button('cancel',()=>r.controller.cancel())):null,
  h(NoSuggestion,{runtime:r,t}),
  h(Preview,{runtime:r,actions:p.inputActions,t,onApplied:setUndo}),
  validUndo?h('div',{className:'lpa-undo-actions'},button('undo',undoApply,!r.allowed)):null,
  visible&&notice?h('div',{className:'lpa-row',role:'status'},h('span',{className:r.result.error?'lpa-error':'lpa-note'},t(typeof notice==='string'?notice:errorKey(notice))),button('dismiss',dismiss)):null);
}
