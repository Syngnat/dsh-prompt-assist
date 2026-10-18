import React from 'react';
import {EMPTY_ENABLEMENT_SOURCE} from './enablement-source.js';
const h=React.createElement;
export function EnablementPanelContent({snapshot,t,onSet,onReload}){
 const {data,connected,loading,pending,readError,writeError,saved}=snapshot;
 const disabled=!data||!connected||!!pending;
 const message=writeError==='stale-enablement'?'global.stale':writeError?'global.saveFailed':readError?'global.disconnected':null;
 return h('section',{className:'lpa-feature','aria-label':t('global.title'),'aria-busy':!!pending},
  h('h2',{className:'lpa-feature-title'},t('global.title')),
  h('p',{className:'lpa-note'},t('global.scope')),
  h('p',{className:'lpa-note'},t('global.charge')),
  h('div',{className:'lpa-row'},['suggest','enhance'].map(feature=>h('label',{className:'lpa-check',key:feature},
   h('input',{type:'checkbox',checked:data?.enabled[feature]===true,disabled,onChange:event=>onSet(feature,event.target.checked)}),t('global.'+feature)))),
  h('p',{className:'lpa-note'},t('global.migration')),
  pending?h('p',{role:'status'},t('global.saving')):null,
  !connected&&!message?h('p',{role:'status',className:'lpa-note'},t(loading?'global.loading':'global.disconnected')):null,
  message?h('p',{role:'alert',className:'lpa-error'},t(message)):null,
  saved&&connected&&saved.revision===data?.revision&&!writeError?h('p',{role:'status',className:'lpa-note'},t('global.saved')):null,
  (!connected||readError||writeError)?h('button',{type:'button',className:'lpa-button',onClick:onReload,disabled:!!pending||loading},t('global.reload')):null);
}
export function EnablementPanel({globalSource=EMPTY_ENABLEMENT_SOURCE,t}){
 const snapshot=React.useSyncExternalStore(globalSource.subscribe,globalSource.getSnapshot,globalSource.getSnapshot);
 return h(EnablementPanelContent,{snapshot,t,onSet:(feature,value)=>{void globalSource.setEnabled(feature,value);},onReload:()=>{void globalSource.load();}});
}
