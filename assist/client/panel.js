import {compactPanelModifier} from './result-layout.js';
import {ResultAnchor} from './result-anchor.js';
import React from 'react';
import {enhanceAvailability,suggestAvailability} from './enhance-action.js';
import {shouldShowPanel} from './panel-visibility.js';
import {useAssistRuntime} from './runtime.js';
import {Preview,NoSuggestion} from './preview.js';
import {undoText,ownsResult} from './editor.js';
import {errorText} from './api.js';
import {css} from './style.js';
const h=React.createElement;
export function AssistPanel(p){
 const r=useAssistRuntime(p),t=p.t;
 const [undo,setUndo]=React.useState(null);
 React.useEffect(()=>{if(!r.session?.subagent&&!r.session?.removed)p.settingsTarget.select(p.sessionId);},[p.settingsTarget,p.sessionId,r.session?.subagent,r.session?.removed]);
 React.useEffect(()=>()=>{p.assistEnhance.clear();p.assistSuggest.clear();},[p.assistEnhance,p.assistSuggest]);
 React.useEffect(()=>{
  p.assistEnhance.update(enhanceAvailability(r),()=>r.controller.generate('enhance',[]));
  p.assistSuggest.update(suggestAvailability(r),()=>r.controller.generate('suggest'));
 },[p.assistEnhance,p.assistSuggest,r.controller,r.allowed,r.state,r.settings,r.dirty,r.busy,r.input,r.result.pending]);
 React.useEffect(()=>{setUndo(null);},[p.sessionId]);
 // The controller registers every automatic landing; the local record only covers the manual path.
 const registered=r.result.undo??null;
 const source=registered??undo;
 const visible=shouldShowPanel({open:false,result:r.result,undo:source,input:r.input,sessionId:p.sessionId});
 if(r.session?.subagent||r.session?.removed||!visible)return null;
 const button=(key,onClick,disabled=false)=>h('button',{type:'button',className:'lpa-button',onClick,disabled},t(key));
 // The draft text decides whether an undo is still meaningful; a recorded revision lags the Host's
 // async insert and would hide the button right after a successful landing.
 const validUndo=ownsResult(source,p.sessionId)&&r.input.draft===source.original;
 const undoApply=()=>{const result=undoText(source,r.readInput,p.inputActions);if(result.ok){if(registered)r.controller.clearLanding?.();setUndo(null);}else r.setNotice(result.reason);};
 const dismiss=()=>{r.controller.dismiss();r.setNotice(null);};
 const landed=r.result.writeback?.mode==='auto'||r.result.writeback?.mode==='stream';
 const notice=r.result.error??r.notice;
 return h(ResultAnchor,null,h('section',{className:'lpa lpa-inline'+compactPanelModifier({pending:r.result.pending,preview:r.result.preview,notice,validUndo,written:r.result.preview?.streaming===true||r.result.writeback?.mode==='auto'||r.result.writeback?.mode==='stream'}),'aria-label':t('preview')},h('style',null,css),
  r.result.pending&&!r.result.preview?h('div',{className:'lpa-row lpa-pending',role:'status'},h('span',{className:'lpa-pending-mark','aria-hidden':true}),t(r.result.pending==='suggest'?'generatingSuggest':'generating'),button('cancel',()=>r.controller.cancel())):null,
  h(NoSuggestion,{runtime:r,t}),
  h(Preview,{runtime:r,actions:p.inputActions,t,onApplied:setUndo,onUndo:undoApply,canUndo:validUndo}),
  validUndo&&!landed?h('div',{className:'lpa-undo-actions'},button('undo',undoApply,!r.allowed)):null,
  visible&&notice?h('div',{className:'lpa-row',role:'status'},h('span',{className:r.result.error?'lpa-error':'lpa-note'},(typeof notice==='string'&&notice!=='requestError'?t(notice):errorText(notice,t))),button('dismiss',dismiss)):null));
}
