import React from 'react';
import {createEnhanceAction} from './enhance-action.js';
import {EnhanceButton} from './enhance-button.js';
import {SuggestButton} from './suggest-button.js';
import {ASSIST_KEY} from '../identity.js';
import {createAssistRpcApi} from '../rpc-transport.js';
import {dictionaries,NS} from './messages.js';
import {AssistPanel} from './panel.js';
import {SettingsPage} from './settings-page.js';
import {css} from './style.js';
import {createSettingsTarget} from './settings-target.js';
import {createEnablementSource} from './enablement-source.js';
import {ModelPicker, MODEL_SLOT, MODEL_PICKER_PRIORITY} from './model-picker.js';
import {readModelStylePref} from './model-style-pref.js';
const h=React.createElement;
function SettingsSurface(p){return h(React.Fragment,null,h('style',null,css),h(SettingsPage,p));}
export function installAssist(ctx){
 ctx.effect(()=>ctx.locale.register(NS,dictionaries));
 const actions=new WeakMap(),targetSource=createSettingsTarget();
 const assistSend=createAssistRpcApi(ctx.connection);
 const globalSource=createEnablementSource({send:assistSend});
 ctx.effect(()=>{void globalSource.start();return()=>globalSource.dispose();});
 const inject=sessionId=>{
  const binding=ctx.sessions.binding(sessionId);if(!binding)throw Error('Prompt assist requires a retained session binding');
  if(!actions.has(binding))actions.set(binding,{enhance:createEnhanceAction(),suggest:createEnhanceAction()});
  const observe=source=>({subscribe:fn=>source.subscribe(fn),getSnapshot:()=>source.getSnapshot()});
  return {assistEnhance:actions.get(binding).enhance,assistSuggest:actions.get(binding).suggest,assistSend,globalSource,settingsTarget:targetSource,
   assistModel:observe(binding.session.projections.faceOf('modelSelection')),assistSource:observe(binding.session.projections.faceOf(ASSIST_KEY)),refreshAssist:()=>ctx.sessions.refreshProjections(sessionId)};
 };
 const label=()=>{const language=ctx.locale.getLocale().active;return dictionaries[language]?.title??(language.startsWith('zh')?dictionaries.zh.title:dictionaries.en.title);};
 // The composer model seat: shadow the shipped picker at a lower priority so the host
 // keeps ownership of scope, permissions and the directory, and resumes it on unload.
 ctx.inject(['slots','sessions','modelDirectories'],scope=>{
  const models=scope.modelDirectories,sessions=scope.sessions;
  scope.slots.inject(MODEL_SLOT,()=>{
  // The style switch: with the DSH picker chosen, this plugin never shadows the
  // shipped seat, so the host's own model selector renders unchanged.
  if(readModelStylePref()==='dsh')return ()=>{};
  return scope.slots.register({
   name:MODEL_SLOT,priority:MODEL_PICKER_PRIORITY,locale:NS,
   inject:sessionId=>{
    const directory=models.directoryFor(sessionId);
    const available=sessions.subagentAddress(sessionId)===undefined;
    return {
     available,
     directory:directory.store,
     load:()=>available?directory.load():Promise.resolve(undefined),
     getLocale:()=>ctx.locale.getLocale().active,
     select:selection=>available?directory.select(selection):Promise.resolve(undefined),
    };
   },
  },ModelPicker);});
 });
 // The same page also opens from the settings dialog's own nav.
 ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'local-prompt-assist',order:95,label,locale:NS,inject:()=>({assistSend,globalSource,targetSource,connection:ctx.connection,refreshAssist:id=>ctx.sessions.refreshProjections(id)})},SettingsSurface));
 ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:'local-prompt-assist',locale:NS,inject:()=>({assistSend,globalSource,targetSource,connection:ctx.connection,returnToConversation:()=>ctx.layout.selectPanel(null),refreshAssist:id=>ctx.sessions.refreshProjections(id)})},SettingsSurface));
 ctx.slots.inject('conversation.input.right',()=>ctx.slots.register({name:'conversation.input.right',id:'local-prompt-enhance-action',order:1005,label:dictionaries.en.enhance,locale:NS,inject},EnhanceButton));
 ctx.slots.inject('conversation.input.right',()=>ctx.slots.register({name:'conversation.input.right',id:'local-next-question-action',order:1010,label:dictionaries.en.suggest,locale:NS,inject},SuggestButton));
 ctx.slots.inject('conversation.input.overlay',()=>ctx.slots.register({name:'conversation.input.overlay',id:'local-prompt-assist-results',order:50,label,locale:NS,inject},AssistPanel));
}
