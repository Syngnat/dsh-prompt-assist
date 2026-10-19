import {isNoSuggestionPlaceholder} from '../suggestion-result.js';
import React from 'react';
import {formatDuration} from './duration.js';
import {applyText,ownsResult} from './editor.js';
const h=React.createElement;
export function NoSuggestion({runtime:r,t}){
 const value=r.result.noSuggestion;
 if(!ownsResult(value,r.sessionId)||value.feature!=='suggest'||value.outcome!=='no-suggestion'||value.text!=='')return null;
 return h('div',{className:'lpa-row lpa-note',role:'status'},
  h('span',null,t('noSuggestion')),
  value.fastSkipped===true?h('span',{className:'lpa-note'},t('fastSkipped')):null,
  h('button',{type:'button',className:'lpa-button',onClick:()=>r.controller.dismiss()},t('dismiss')));
}
export function Preview({runtime:r,actions,t,onApplied}){
 const value=r.result.preview;
 if(!value||!ownsResult(value,r.sessionId))return null;
  if(value.feature==='suggest'&&((value.outcome!==undefined&&value.outcome!=='suggestion')||typeof value.text!=='string'||!value.text.trim()||isNoSuggestionPlaceholder(value.text)))return null;
 const blocked=value.snapshot.structured;
 const button=(key,action,disabled=false,primary=false)=>h('button',{type:'button',className:'lpa-button'+(primary?' lpa-button--primary':''),onClick:action,disabled},t(key));
 function apply(){
  if(value.streaming||!ownsResult(value,r.sessionId))return;
  const outcome=applyText(value.snapshot,value.text,r.readInput,actions);
  if(outcome.ok){onApplied({...outcome.undo,sessionId:r.sessionId});r.controller.dismiss();}else r.setNotice(outcome.reason);
 }
 async function copy(){try{await navigator.clipboard.writeText(value.text);r.setNotice('copied');}catch{r.setNotice('requestError');}}
 const diagnostics=value.route||value.timing||value.filesRead?.length||value.warnings?.length;
 return h('section',{className:'lpa-preview','aria-label':t(value.feature),'aria-busy':Boolean(value.streaming)},
  h('header',{className:'lpa-preview-header'},h('span',null,t(value.feature)),value.streaming?h('span',{className:'lpa-preview-status'},t('streamingShort')):null),
  h('pre',{className:'lpa-result-text'},value.text),
  value.fastSkipped===true?h('p',{className:'lpa-note',role:'status'},t('fastSkipped')):null,
  blocked?h('p',{className:'lpa-note'},t('structured')):null,
  h('div',{className:'lpa-preview-actions'},
   button(value.feature==='suggest'?'accept':'apply',apply,value.streaming||blocked||!r.allowed||(value.feature==='suggest'&&r.busy)||r.dirty,true),
   button('copy',copy,Boolean(value.streaming)),
   value.streaming?button('cancel',()=>r.controller.cancel()):button('dismiss',()=>r.controller.dismiss())),
  h('div',{className:'lpa-preview-meta'},
   value.feature==='enhance'?h('details',null,h('summary',null,t('showOriginal')),h('pre',null,value.original)):null,
   diagnostics?h('details',null,h('summary',null,t('generationDetails')),
    value.route?h('p',null,t('route'),': ',[value.route.provider,value.route.model,value.route.reasoningEffort,value.route.fast?t('fast'):''].filter(Boolean).join(' / ')):null,
    value.timing?h('p',null,t('firstTokenLabel'),': ',formatDuration(value.timing.ttftMs,t('secondsUnit')),' · ',t('totalTimeLabel'),': ',formatDuration(value.timing.totalMs,t('secondsUnit'))):null,
    value.filesRead?.length?h('p',null,t('filesRead'),': ',value.filesRead.map(f=>f.name).join(', ')):null,
    value.warnings?.length?h('p',null,t('warningsLabel'),': ',value.warnings.length):null):null));
}
