import {isNoSuggestionPlaceholder} from '../suggestion-result.js';
import React from 'react';
import {formatDuration} from './duration.js';
import {applyText,ownsResult} from './editor.js';
import {isUnchangedEnhancement} from './enhance-result.js';
const h=React.createElement;
export function NoSuggestion({runtime:r,t}){
 const value=r.result.noSuggestion;
 if(!ownsResult(value,r.sessionId)||value.feature!=='suggest'||value.outcome!=='no-suggestion'||value.text!==''||value.automatic===true)return null;
 return h('div',{className:'lpa-row lpa-note',role:'status'},
  h('span',null,t('noSuggestion')),
  value.fastSkipped===true?h('span',{className:'lpa-note'},t('fastSkipped')):null,
  h('button',{type:'button',className:'lpa-button',onClick:()=>r.controller.dismiss()},t('dismiss')));
}
export function Preview({runtime:r,actions,t,onApplied,onUndo,canUndo}){
 const value=r.result.preview;
 if(!value||!ownsResult(value,r.sessionId))return null;
  if(value.feature==='suggest'&&((value.outcome!==undefined&&value.outcome!=='suggestion')||typeof value.text!=='string'||!value.text.trim()||isNoSuggestionPlaceholder(value.text)))return null;
 const writeback=r.result.writeback??null;
 const mode=writeback?.mode??null;
 const written=mode==='auto'||mode==='stream';
 const blocked=value.snapshot.structured;
 const unchanged=value.feature==='enhance'&&!value.streaming&&isUnchangedEnhancement(value.original,value.text);
 // Write-back wording is newer than this file's dictionary guarantee; fall back to a shipped key.
 // The Host locale hands back the key itself when it has no entry, so a miss is never a real label.
 const translate=(key,fallback)=>{const text=t(key);return text===undefined||text===null||text===''||text===key?t(fallback):text;};
 const status=value.streaming?translate('enhanceStreamingWrite','streamingShort')
  :written?translate('enhanceWritten','apply'):null;
 const landing=mode==='taken-over'?translate('enhanceTakenOver','stale')
  :mode==='blocked'?translate('enhanceBlocked',writeback.reason==='structured'?'structured':'stale'):null;
 const button=(key,action,disabled=false,primary=false)=>h('button',{type:'button',className:'lpa-button'+(primary?' lpa-button--primary':''),onClick:action,disabled},t(key));
 // Text that already reached the composer must not come back as a preview card: the reader would have
 // to dismiss a copy of what they can already see above it. Keep one thin status line while streaming
 // and after landing; the full card is reserved for states that still need a manual decision.
 if(value.feature==='enhance'&&(written||value.streaming)){
  return h('div',{className:'lpa-row lpa-note',role:'status','aria-label':t(value.feature)},
   h('span',{className:'lpa-preview-status'},status),
   written&&canUndo?button('undo',onUndo,!r.allowed):null,
   written?h('details',{className:'lpa-original'},
    h('summary',null,t('showOriginal')),
    h('pre',null,value.original)):null,
   value.streaming?button('cancel',()=>r.controller.cancel()):button('dismiss',()=>r.controller.dismiss()));
 }
 function apply(){
  if(value.streaming||unchanged||!ownsResult(value,r.sessionId))return;
  // Once write-back engaged, the controller owns the undo record; never fork a second source.
  if(value.feature==='enhance'&&writeback&&typeof r.controller?.applyStaged==='function'){
   const outcome=r.controller.applyStaged();
   if(!outcome.ok)r.setNotice(outcome.reason);
   return;
  }
  const outcome=applyText(value.snapshot,value.text,r.readInput,actions);
  if(outcome.ok){onApplied({...outcome.undo,sessionId:r.sessionId});r.controller.dismiss();}else r.setNotice(outcome.reason);
 }
 async function copy(){try{await navigator.clipboard.writeText(value.text);r.setNotice('copied');}catch{r.setNotice('requestError');}}
 const diagnostics=value.route||value.timing||value.filesRead?.length||value.warnings?.length;
 return h('section',{className:'lpa-preview','aria-label':t(value.feature),'aria-busy':Boolean(value.streaming)},
  h('header',{className:'lpa-preview-header'},h('span',null,t(value.feature)),status?h('span',{className:'lpa-preview-status'},status):null),
  h('pre',{className:'lpa-result-text'},value.text),
  landing?h('p',{className:'lpa-note',role:'status'},landing):null,
  unchanged?h('p',{className:'lpa-note',role:'status'},t('enhanceUnchanged')):null,
  value.fastSkipped===true?h('p',{className:'lpa-note',role:'status'},t('fastSkipped')):null,
  blocked?h('p',{className:'lpa-note'},t('structured')):null,
  h('div',{className:'lpa-preview-actions'},
   written?null:button(value.feature==='suggest'?'accept':'apply',apply,value.streaming||unchanged||blocked||!r.allowed||(value.feature==='suggest'&&r.busy)||r.dirty,true),
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
