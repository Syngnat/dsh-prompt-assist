import {UpdatePanel} from "./update-panel.js";
import React from 'react';
import {Settings} from './settings.js';
import {useModelOptions} from './runtime.js';
import {errorText,sessionSettings} from './api.js';
import {EnablementPanel} from './enablement-panel.js';
import {createSettingsDraft,editSettingsDraft,acceptSettingsSave,createSettingsRequests} from './settings-page-state.js';
const h=React.createElement;

function FeatureSettings({feature,host,sessionId,p,allowed,onSaved}){
 const [draft,setDraft]=React.useState(()=>createSettingsDraft(host.settings[feature]));
 const current=React.useRef(draft);current.current=draft;
 const [saving,setSaving]=React.useState(false),[notice,setNotice]=React.useState(null);
 const scope=React.useRef(null),inFlight=React.useRef(false);
 React.useEffect(()=>{scope.current=createSettingsRequests();inFlight.current=false;return()=>scope.current.close();},[]);
 const runtime={sessionId,send:p.assistSend,currentModel:host.current};
 const options=useModelOptions(runtime,feature,draft.config,true);
 const edit=config=>{const next=editSettingsDraft(current.current,config);current.current=next;setDraft(next);setNotice(null);};
 async function save(config){
  if(!allowed||inFlight.current||!scope.current)return;
  const request=scope.current.begin(),version=current.current.version;inFlight.current=true;setSaving(true);setNotice(null);
  try{
   const value=await p.assistSend('save',sessionId,{feature,config:sessionSettings(config)},request.signal);
   if(!request.valid())return;
   onSaved(feature,value);
   const next=acceptSettingsSave(current.current,version,value.settings[feature]);
   current.current=next;setDraft(next);if(!next.dirty)setNotice('saved');
   await p.refreshAssist(sessionId).catch(()=>{});
  }catch(error){if(request.valid())setNotice(error);}
  finally{request.finish();if(request.valid()){inFlight.current=false;setSaving(false);}}
 }
 const noticeValue=notice??options.error;
 return h('section',{className:'lpa-feature','aria-label':p.t(feature)},
  h('h2',{className:'lpa-feature-title'},p.t(feature)),
  h('p',{className:'lpa-note'},p.t(feature==='suggest'?'suggestContext':'enhanceOriginal')),
  h(Settings,{t:p.t,config:draft.config,catalog:options.catalog,capabilities:options.capabilities,allowed,saving,onChange:edit,save}),
  h('div',{className:'lpa-settings-feedback'},draft.dirty?h('p',{className:'lpa-note'},p.t('settingsChanged')):null,
  noticeValue?h('p',{role:'status',className:noticeValue==='saved'?'lpa-note':'lpa-error'},(typeof noticeValue==='string'&&noticeValue!=='requestError'?p.t(noticeValue):errorText(noticeValue,p.t))):null));
}

function SessionSettings({sessionId,p}){
 const allowed=p.useSessionAccess(sessionId,'commands/execute');
 const [host,setHost]=React.useState(null),[error,setError]=React.useState(null);
 React.useEffect(()=>{
  const abort=new AbortController();setHost(null);setError(null);
  p.assistSend('state',sessionId,{},abort.signal).then(value=>{if(!abort.signal.aborted)setHost(value);}).catch(error=>{if(!abort.signal.aborted)setError(error);});
  return()=>abort.abort();
 },[sessionId,p.assistSend]);
 const onSaved=(feature,value)=>setHost(old=>({...old,settings:{...old.settings,[feature]:value.settings[feature]}}));
 return h(React.Fragment,null,
  h('p',{className:'lpa-note'},p.t('editingSession'),': ',h('code',null,sessionId)),
  !allowed?h('p',{className:'lpa-note'},p.t('access')):null,
  error?h('p',{className:'lpa-error',role:'alert'},errorText(error,p.t)):null,
  !host&&!error?h('p',{role:'status'},p.t('loading')):null,
  host?h('div',{className:'lpa-settings-cards'},['suggest','enhance'].map(feature=>h(FeatureSettings,{key:feature,feature,host,sessionId,p,allowed,onSaved}))):null);
}

export function SettingsPage(p){
 const target=React.useSyncExternalStore(p.targetSource.subscribe,p.targetSource.getSnapshot,p.targetSource.getSnapshot);
 return h('section',{className:'lpa lpa-settings-page','aria-label':p.t('title')},
  h('header',{className:'lpa-settings-header'},h('h1',null,p.t('title')),h('button',{type:'button',className:'lpa-button',onClick:p.returnToConversation},p.t('returnConversation'))),
  h(EnablementPanel,{globalSource:p.globalSource,t:p.t}),
  h('p',{className:'lpa-note'},p.t('sessionScope')),
  target.sessionId?h(SessionSettings,{key:target.sessionId,sessionId:target.sessionId,p}):h('p',{role:'status'},p.t('chooseSession')),
   h(UpdatePanel,{t:p.t}));
}
