import {UpdatePanel} from "./update-panel.js";
import {readModelStylePref,writeModelStylePref} from './model-style-pref.js';
import React from 'react';
import {Settings} from './settings.js';
import {useModelOptions} from './runtime.js';
import {errorText} from './api.js';
import {EnablementPanel} from './enablement-panel.js';
import {EMPTY_ENABLEMENT_SOURCE} from './enablement-source.js';
import {PriorityPanel} from './priority-panel.js';
import {createSettingsDraft,editSettingsDraft,syncSettingsDraft,acceptSettingsSave,matchesSettingsSave,createSettingsRequests} from './settings-page-state.js';
const h=React.createElement;

function FeatureSettings({feature,global,source,p}){
 const host=global.data;
 const [draft,setDraft]=React.useState(()=>createSettingsDraft(host.settings[feature],host.settingsRevision));
 const current=React.useRef(draft);current.current=draft;
 const [saving,setSaving]=React.useState(false),[notice,setNotice]=React.useState(null);
 const scope=React.useRef(null),inFlight=React.useRef(false);
 React.useEffect(()=>{const requests=createSettingsRequests();scope.current=requests;inFlight.current=false;setSaving(false);return()=>requests.close();},[]);
 React.useEffect(()=>{const next=syncSettingsDraft(current.current,host.settings[feature],host.settingsRevision);current.current=next;setDraft(next);},[host.settingsRevision,host.settings[feature]]);
 const runtime={send:p.assistSend};
 const options=useModelOptions(runtime,feature,draft.config,true);
 const allowed=global.connected&&Number.isSafeInteger(host.settingsRevision)&&!global.pending;
 const stale=draft.dirty&&draft.settingsRevision!==host.settingsRevision;
 const edit=config=>{const next=editSettingsDraft(current.current,config);current.current=next;setDraft(next);setNotice(null);};
 async function save(config){
  if(!allowed||inFlight.current||!scope.current)return;
  const request=scope.current.begin(),version=current.current.version,base=current.current.settingsRevision;
  inFlight.current=true;setSaving(true);setNotice(null);
  try{
   const saved=await source.configure(feature,config,base,request.signal);
   if(!request.valid())return;
   const snapshot=source.getSnapshot();
   if(saved&&matchesSettingsSave(snapshot,feature,config)){const next=acceptSettingsSave(current.current,version,config,snapshot.saved.settingsRevision);current.current=next;setDraft(next);if(!next.dirty)setNotice('saved');}
   else setNotice({code:saved?'stale-global-settings':snapshot.writeError??'global-unavailable'});
  }catch(error){if(request.valid())setNotice(error);}
  finally{request.finish();if(request.valid()){inFlight.current=false;setSaving(false);}}
 }
 function reset(){const next=createSettingsDraft(host.settings[feature],host.settingsRevision);current.current=next;setDraft(next);setNotice(null);}
 const noticeValue=notice??options.error;
 // The draft feedback lives inside the form: the card stays a four-child subgrid
 // (title, context note, unconfigured note, form). A fifth child overflows the
 // span-4 subgrid in Chromium and collapses the transparent feedback grid onto
 // the form, which swallowed every pointer event over the rounds select and the
 // save button — the settings could not be saved at all.
 return h('section',{className:'lpa-feature lpa-card','aria-label':p.t(feature)},
  h('h2',{className:'lpa-feature-title'},p.t(feature)),
  h('p',{className:'lpa-note'},p.t(feature==='suggest'?'suggestContext':'enhanceOriginal')),
  h('p',{className:'lpa-note',role:'status'},host.configured[feature]?null:p.t('settings.unconfigured')),
  h(Settings,{t:p.t,config:draft.config,catalog:options.catalog,capabilities:options.capabilities,allowed:allowed&&!stale,saving,onChange:edit,save,
   feedback:h('div',{className:'lpa-settings-feedback'},draft.dirty?h('p',{className:'lpa-note'},p.t('settingsChanged')):null,
   stale?h('p',{className:'lpa-error',role:'alert'},p.t('settings.stale')):null,
   draft.dirty?h('button',{type:'button',className:'lpa-button',disabled:!global.connected||Boolean(global.pending),onClick:reset},p.t('settings.resetDraft')):null,
   noticeValue?h('p',{role:'status',className:noticeValue==='saved'?'lpa-note':'lpa-error'},noticeValue==='saved'?p.t('saved'):errorText(noticeValue,p.t)):null)}));
}

function ModelStyleCard({t}){
 const [style,setStyle]=React.useState(readModelStylePref());
 const options=[['dsh','settings.modelStyleDsh','settings.modelStyleDshNote'],
  ['claude','settings.modelStyleClaude','settings.modelStyleClaudeNote'],
  ['zcode','settings.modelStyleZcode','settings.modelStyleZcodeNote']];
 return h('section',{className:'lpa-feature lpa-card','aria-label':t('settings.modelStyleSection')},
  h('header',{className:'lpa-card-header'},h('h2',{className:'lpa-feature-title lpa-card-title'},t('settings.modelStyleSection')),h('p',{className:'lpa-note'},t('settings.modelStyleHint'))),
  h('div',{className:'lpa-style-options',role:'radiogroup','aria-label':t('settings.modelStyleSection')},
   options.map(([value,nameKey,noteKey])=>h('button',{key:value,type:'button',role:'radio','aria-checked':style===value,
    className:'lpa-style-option'+(style===value?' lpa-style-option--active':''),
    onClick:()=>{setStyle(value);writeModelStylePref(value);}},
    h('span',{className:'lpa-style-option-name'},t(nameKey)),h('span',{className:'lpa-note'},t(noteKey))))));
}
const SECTION_KEY='lpa_settings_section';
const readSection=()=>{try{return localStorage.getItem(SECTION_KEY)||'assist';}catch{return 'assist';}};
const writeSection=value=>{try{localStorage.setItem(SECTION_KEY,value);}catch{}};
export function SettingsPage(p){
 const target=React.useSyncExternalStore(p.targetSource.subscribe,p.targetSource.getSnapshot,p.targetSource.getSnapshot);
 const source=p.globalSource??EMPTY_ENABLEMENT_SOURCE;
 const global=React.useSyncExternalStore(source.subscribe,source.getSnapshot,source.getSnapshot);
 const [stored,setStored]=React.useState(readSection),nav=React.useRef(null);
 // Sections are a tab list, not one long column: the profile panel used to sit under every
 // other card and the update controls at the very bottom, so finding one needed a full scroll.
 const sections=[
  {key:'assist',label:'settings.nav.assist',render:()=>h(React.Fragment,null,
   h(EnablementPanel,{globalSource:source,t:p.t}),
   h('section',{className:'lpa-session-panel lpa-card','aria-label':p.t('settings.profileSection')},
    h('header',{className:'lpa-card-header'},h('h2',{className:'lpa-card-title'},p.t('settings.profileSection')),h('p',{className:'lpa-note'},p.t('profileScope'))),
    global.loading?h('p',{role:'status'},p.t('global.loading')):null,
    !global.connected?h('p',{className:'lpa-note',role:'status'},p.t('global.disconnected')):null,
    global.readError?h('p',{className:'lpa-error',role:'alert'},errorText(global.readError,p.t)):null,
    global.data&&!Number.isSafeInteger(global.data.settingsRevision)?h('p',{className:'lpa-error',role:'alert'},p.t('settings.hostUpgrade')):null,
    global.data?h('div',{className:'lpa-settings-cards'},['suggest','enhance'].map(feature=>h(FeatureSettings,{key:feature,feature,global,source,p}))):h('p',{className:'lpa-note lpa-empty-state'},p.t('settings.profileEmpty'))))},
  p.connection?{key:'priority',label:'settings.nav.priority',render:()=>h(PriorityPanel,{connection:p.connection,t:p.t,onChanged:()=>{if(target.sessionId)void p.refreshAssist(target.sessionId).catch(()=>{});}})}:null,
  {key:'style',label:'settings.nav.style',render:()=>h(ModelStyleCard,{t:p.t})},
  {key:'update',label:'settings.nav.update',render:()=>h(UpdatePanel,{t:p.t})}].filter(Boolean);
 const active=sections.some(section=>section.key===stored)?stored:sections[0].key;
 const select=key=>{setStored(key);writeSection(key);};
 const moveFocus=event=>{
  const keys=sections.map(section=>section.key),index=keys.indexOf(active);
  const forward=event.key==='ArrowRight'||event.key==='ArrowDown',back=event.key==='ArrowLeft'||event.key==='ArrowUp';
  const next=event.key==='Home'?0:event.key==='End'?keys.length-1:forward?Math.min(keys.length-1,index+1):back?Math.max(0,index-1):-1;
  if(next<0||next===index)return;
  event.preventDefault();select(keys[next]);
  const buttons=nav.current?.querySelectorAll('[role=tab]');buttons?.[next]?.focus();
 };
 return h('section',{className:'lpa lpa-settings-page','aria-label':p.t('title')},
  h('header',{className:'lpa-settings-header'},
   h('div',{className:'lpa-settings-heading'},h('h1',null,p.t('title')),h('p',{className:'lpa-note lpa-settings-subtitle'},p.t('settings.subtitle'))),
   p.returnToConversation?h('button',{type:'button',className:'lpa-button',onClick:p.returnToConversation},p.t('returnConversation')):null),
  h('div',{className:'lpa-settings-layout'},
   h('nav',{ref:nav,className:'lpa-settings-nav',role:'tablist','aria-orientation':'horizontal','aria-label':p.t('settings.sectionNav'),onKeyDown:moveFocus},
    sections.map(section=>h('button',{key:section.key,type:'button',role:'tab',id:'lpa-tab-'+section.key,'aria-selected':active===section.key,
     'aria-controls':'lpa-panel-'+section.key,tabIndex:active===section.key?0:-1,
     className:'lpa-nav-item'+(active===section.key?' lpa-nav-item--active':''),onClick:()=>select(section.key)},p.t(section.label)))),
   h('div',{className:'lpa-settings-panels'},
    sections.map(section=>h('div',{key:section.key,role:'tabpanel',id:'lpa-panel-'+section.key,'aria-labelledby':'lpa-tab-'+section.key,
     hidden:active!==section.key,className:'lpa-settings-panel'},section.render())))));
}
