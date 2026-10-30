import React from "react";
import {reconcileState,catalogInput} from "./api.js";
import {createAssistController} from "./controller.js";
import {EMPTY_ENABLEMENT_SOURCE,mergeGlobalSettings,createEnablementObserver} from "./enablement-source.js";
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
 const current=React.useRef({input,actions:p.inputActions,sessionId:p.sessionId});current.current={input,actions:p.inputActions,sessionId:p.sessionId};
 const alive=React.useRef(false);
 const send=p.assistSend;
 const controller=React.useMemo(()=>createAssistController({send,actions:()=>current.current.actions,readInput:()=>current.current.input,publish:value=>{if(alive.current)setResult(value);},requestId:()=>globalThis.crypto.randomUUID()}),[p.sessionId,send]);
 const observeEnablement=React.useMemo(()=>createEnablementObserver(controller),[controller]);
 const hostValue=host?.sessionId===p.sessionId?host.value:null;
 const allowed=p.useAccess("commands/execute")&&!session?.subagent&&!session?.removed;
 const reconciled=reconcileState(hostValue,wire,session,allowed);
 const busy=reconciled.busy||!enablement.connected;
 const settings=React.useMemo(()=>mergeGlobalSettings(null,enablement),[enablement.connected,enablement.data]);
 const state=reconciled.state?{...reconciled.state,settings}:null;
 const route=selection?.next??state?.current;
 const routeKey=JSON.stringify(route??null);
 React.useEffect(()=>{
  alive.current=true;controller.mount();setHost(null);setNotice(null);setResult({pending:null,preview:null,noSuggestion:null,error:null});
  p.refreshAssist().catch(()=>{});
  return()=>{alive.current=false;controller.dispose();};
 },[p.sessionId,controller,send]);
 React.useEffect(()=>{
  if(wire?.busy||session?.running)return;
  const abort=new AbortController();
  send("state",p.sessionId,{},abort.signal).then(value=>{if(!abort.signal.aborted){setHost({sessionId:p.sessionId,value});setNotice(null);}}).catch(error=>{if(!abort.signal.aborted)setNotice(error);});
  return()=>abort.abort();
 },[p.sessionId,send,wire?.qaId,wire?.busy,session?.running]);
 React.useEffect(()=>{observeEnablement({sessionId:p.sessionId,input,settings,qaId:state?.qaId,busy,paused:false,routeKey},enablement);},[observeEnablement,p.sessionId,input,settings,state?.qaId,busy,routeKey,enablement.connected,enablement.data]);
 // Older inline entry points cannot provide a draft CAS baseline. Never save session controls.
 async function save(){setNotice('settings.globalOnly');return false;}
 function edited(){setNotice('settings.globalOnly');controller.configurationEdited();}
 return {sessionId:p.sessionId,input,session,state,currentModel:route,settings,result,controller,send,save,edited,dirty:false,dirtyFeatures:[],saving:false,notice,setNotice,allowed,busy,readInput:()=>current.current.input};
}

export function useModelOptions(runtime,feature,config,open) {
 const [catalog,setCatalog]=React.useState({providers:[],models:[]});
 const [capabilities,setCapabilities]=React.useState(null);
 const [error,setError]=React.useState(null);
 const current=runtime.currentModel;
 const provider=config.followSession?current?.provider:config.provider;
 const model=config.followSession?current?.model:config.model;
 React.useEffect(()=>{
  setCatalog({providers:[],models:[]});if(!open)return;const abort=new AbortController();setError(null);
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
