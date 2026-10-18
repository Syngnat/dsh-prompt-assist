import React from "react";
import {DEFAULT_SETTINGS,reconcileState,catalogInput,sessionSettings} from "./api.js";
import {createAssistController} from "./controller.js";
import {EMPTY_ENABLEMENT_SOURCE,mergeGlobalSettings,createEnablementObserver} from "./enablement-source.js";
const EMPTY={suggest:DEFAULT_SETTINGS,enhance:DEFAULT_SETTINGS};
export function useAssistRuntime(p) {
 const globalSource=p.globalSource??EMPTY_ENABLEMENT_SOURCE;
 const enablement=React.useSyncExternalStore(globalSource.subscribe,globalSource.getSnapshot,globalSource.getSnapshot);
 const input=p.useInput(s=>s);
 const session=p.useSession(s=>s);
 const wire=React.useSyncExternalStore(p.assistSource.subscribe,p.assistSource.getSnapshot,p.assistSource.getSnapshot);
 const selection=React.useSyncExternalStore(p.assistModel.subscribe,p.assistModel.getSnapshot,p.assistModel.getSnapshot);
 const [host,setHost]=React.useState(null);
 const [result,setResult]=React.useState({pending:null,preview:null,noSuggestion:null,error:null});
 const [notice,setNotice]=React.useState(null);
 const [saving,setSaving]=React.useState(false);
 const [dirtyFeatures,setDirtyFeatures]=React.useState([]);
 const editVersions=React.useRef({suggest:0,enhance:0});
 const saves=React.useRef(new Set());
 const current=React.useRef({input,actions:p.inputActions,sessionId:p.sessionId});current.current={input,actions:p.inputActions,sessionId:p.sessionId};
 const alive=React.useRef(false);
 const send=p.assistSend;
 const controller=React.useMemo(()=>createAssistController({send,actions:()=>current.current.actions,publish:value=>{if(alive.current)setResult(value);},requestId:()=>globalThis.crypto.randomUUID()}),[p.sessionId,send]);
 const observeEnablement=React.useMemo(()=>createEnablementObserver(controller),[controller]);
 const hostValue=host?.sessionId===p.sessionId?host.value:null;
 const allowed=p.useAccess("commands/execute")&&!session?.subagent&&!session?.removed;
 const reconciled=reconcileState(hostValue,wire,session,allowed);
 const busy=reconciled.busy||!enablement.connected;
 const sessionSettingsValue=reconciled.state?.settings??EMPTY;
 const settings=React.useMemo(()=>mergeGlobalSettings(sessionSettingsValue,enablement),[sessionSettingsValue,enablement.connected,enablement.data]);
 const state=reconciled.state?{...reconciled.state,settings}:null;
 const dirty=dirtyFeatures.length>0;
 const route=selection?.next??state?.current;
 const routeKey=JSON.stringify(route??null);
 React.useEffect(()=>{
  alive.current=true;controller.mount();setHost(null);setDirtyFeatures([]);setNotice(null);setSaving(false);setResult({pending:null,preview:null,noSuggestion:null,error:null});
  p.refreshAssist().catch(()=>{});
  return()=>{alive.current=false;for(const save of saves.current)save.abort();saves.current.clear();controller.dispose();};
 },[p.sessionId,controller,send]);
 React.useEffect(()=>{
  if(wire?.busy||session?.running)return;
  const abort=new AbortController();
  send("state",p.sessionId,{},abort.signal).then(value=>{if(!abort.signal.aborted){setHost({sessionId:p.sessionId,value});setNotice(null);}}).catch(error=>{if(!abort.signal.aborted)setNotice(error);});
  return()=>abort.abort();
 },[p.sessionId,send,wire?.qaId,wire?.busy,session?.running]);
 React.useEffect(()=>{observeEnablement({sessionId:p.sessionId,input,settings,qaId:state?.qaId,busy,paused:dirty,routeKey},enablement);},[observeEnablement,p.sessionId,input,settings,state?.qaId,busy,dirty,routeKey,enablement.connected,enablement.data?.revision]);
 async function save(feature,config){
  if(saving||!allowed)return;controller.configurationEdited();setSaving(true);setNotice(null);
  const version=editVersions.current[feature];const owner=p.sessionId;const abort=new AbortController();saves.current.add(abort);
  const valid=()=>alive.current&&!abort.signal.aborted&&current.current.sessionId===owner;
  try{
   const value=await send("save",owner,{feature,config:sessionSettings(config)},abort.signal);if(!valid())return;
   setHost({sessionId:owner,value});await p.refreshAssist();if(!valid())return;
   if(editVersions.current[feature]===version){setDirtyFeatures(old=>old.filter(key=>key!==feature));setNotice("saved");return true;}
  }catch(error){if(valid())setNotice(error);}
  finally{saves.current.delete(abort);if(valid())setSaving(false);}
 }
 function edited(feature){editVersions.current[feature]+=1;setDirtyFeatures(old=>old.includes(feature)?old:[...old,feature]);setNotice(null);controller.configurationEdited();}
 return {sessionId:p.sessionId,input,session,state,currentModel:route,settings,result,controller,send,save,edited,dirty,dirtyFeatures,saving,notice,setNotice,allowed,busy,readInput:()=>current.current.input};
}

export function useModelOptions(runtime,feature,config,open) {
 const [catalog,setCatalog]=React.useState({providers:[],models:[]});
 const [capabilities,setCapabilities]=React.useState(null);
 const [error,setError]=React.useState(null);
 const current=runtime.currentModel;
 const provider=config.followSession?current?.provider:config.provider;
 const model=config.followSession?current?.model:config.model;
 React.useEffect(()=>{
  if(!open)return;const abort=new AbortController();setError(null);
  runtime.send("catalog",runtime.sessionId,catalogInput(config,provider),abort.signal).then(value=>{if(!abort.signal.aborted)setCatalog(value);}).catch(error=>{if(!abort.signal.aborted)setError(error);});
  return()=>abort.abort();
 },[runtime.send,runtime.sessionId,open,provider,config.followSession]);
 React.useEffect(()=>{
  setCapabilities(null);setError(null);if(!open||!provider||!model)return;const abort=new AbortController();
  runtime.send("model",runtime.sessionId,{provider,model},abort.signal).then(value=>{if(!abort.signal.aborted)setCapabilities(value);}).catch(error=>{if(!abort.signal.aborted)setError(error);});
  return()=>abort.abort();
 },[runtime.send,runtime.sessionId,open,provider,model,feature]);
 return {catalog,capabilities,error};
}
