import {sessionSettings} from './api.js';
import {ENABLEMENT_PATH as HOST_ENABLEMENT_PATH} from '../identity.js';
import {normalizeNotes,EMPTY_NOTES} from './model-notes.js';
export const ENABLEMENT_PATH=HOST_ENABLEMENT_PATH.slice(1);
const FEATURES=['suggest','enhance'];
const invalid=()=>Object.assign(new Error('transport-invalid-response'),{code:'transport-invalid-response'});
export function normalizeEnablement(value){
 if(!value||value.scope!=='profile'||!Number.isSafeInteger(value.revision)||value.revision<0||!value.enabled
  ||FEATURES.some(feature=>typeof value.enabled[feature]!=='boolean'))throw invalid();
 const hasSettings=value.settings!==undefined||value.settingsRevision!==undefined||value.configured!==undefined;
 if(hasSettings&&(!Number.isSafeInteger(value.settingsRevision)||value.settingsRevision<0||!value.settings||!value.configured||FEATURES.some(feature=>{
  const config=value.settings[feature];return typeof value.configured[feature]!=='boolean'||!config||typeof config.followSession!=='boolean'||typeof config.fast!=='boolean'||!Number.isInteger(config.rounds)||config.rounds<1||config.rounds>20||['provider','model','reasoningEffort'].some(key=>typeof config[key]!=='string');
 })))throw invalid();
 return Object.freeze({scope:'profile',revision:value.revision,enabled:Object.freeze({suggest:value.enabled.suggest,enhance:value.enabled.enhance}),
  settingsRevision:hasSettings?value.settingsRevision:null,
  settings:Object.freeze(Object.fromEntries(FEATURES.map(feature=>[feature,Object.freeze(sessionSettings(hasSettings?value.settings[feature]:undefined))]))),
  configured:Object.freeze(Object.fromEntries(FEATURES.map(feature=>[feature,hasSettings&&value.configured[feature]]))),
  ...normalizeNotes(value)});
}
const initial=()=>({data:null,connected:false,loading:true,pending:null,readError:null,writeError:null,saved:null});
const empty=Object.freeze(initial());
export const EMPTY_ENABLEMENT_SOURCE=Object.freeze({getSnapshot:()=>empty,subscribe:()=>()=>{},load:async()=>false,setEnabled:async()=>false,configure:async()=>false});
/** Session/wire controls and flags are never authority, even before the first global snapshot. */
export function mergeGlobalSettings(settings,global){
 return Object.fromEntries(FEATURES.map(feature=>[feature,{...sessionSettings(global?.data?.settings?.[feature]),enabled:global?.connected===true&&global.data?.configured?.[feature]===true&&global.data?.enabled[feature]===true}]));
}
/** Reset QA on flags, controls, migration or connection changes, never on save feedback alone. */
export function createEnablementObserver(controller){
 let previous;
 return (frame,global)=>{
  const identity=JSON.stringify([global?.connected===true,global?.data?.revision??null,global?.data?.settingsRevision??null,global?.data?.configured??null]);
  if(previous!==undefined&&identity!==previous){controller.configurationEdited();controller.mount();}
  previous=identity;controller.observe(frame);
 };
}

/** One source per plugin, shared by all sessions and the no-session settings surface. */
export function createEnablementSource({send,fetcher=(...args)=>globalThis.fetch(...args),setTimer=setTimeout,clearTimer=clearTimeout}){
 let state=initial(),disposed=true,epoch=0,readEpoch=0,readAbort=null,writeAbort=null,watchAbort=null,reader=null,timer=null,backoff=1000;
 const listeners=new Set();
 const publish=patch=>{if(Object.keys(patch).every(key=>state[key]===patch[key]))return;state={...state,...patch};for(const listener of listeners)listener();};
 const accept=value=>{
  let data=normalizeEnablement(value);const old=state.data;
  if(old?.settingsRevision!=null&&data.settingsRevision===null)throw invalid();
  // Each independent store contributes only its monotonic component; never roll either back.
  if(old&&data.revision===old.revision&&FEATURES.some(key=>data.enabled[key]!==old.enabled[key]))throw invalid();
  if(old&&data.settingsRevision===old.settingsRevision&&(JSON.stringify(data.settings)!==JSON.stringify(old.settings)||JSON.stringify(data.configured)!==JSON.stringify(old.configured)))throw invalid();
  if(old&&data.notesRevision===old.notesRevision&&JSON.stringify(data.notes)!==JSON.stringify(old.notes))throw invalid();
  if(old&&data.revision===old.revision&&data.settingsRevision===old.settingsRevision&&data.notesRevision===old.notesRevision)return true;
  if(old){
   if(data.revision<=old.revision&&(data.settingsRevision??-1)<=(old.settingsRevision??-1)&&(data.notesRevision??-1)<=(old.notesRevision??-1))return false;
   if(data.revision<old.revision)data={...data,revision:old.revision,enabled:old.enabled};
   if((data.settingsRevision??-1)<(old.settingsRevision??-1))data={...data,settingsRevision:old.settingsRevision,settings:old.settings,configured:old.configured};
   if((data.notesRevision??-1)<(old.notesRevision??-1))data={...data,notesRevision:old.notesRevision,notes:old.notes};
   data=Object.freeze(data);
  }
  publish({data,saved:null});return true;
 };
 const clearRetry=()=>{if(timer!==null)clearTimer(timer);timer=null;};
 async function load(){
  if(disposed)return false;
  readAbort?.abort();const abort=new AbortController(),revision=++readEpoch,owner=epoch;readAbort=abort;
  publish({loading:true,readError:null});
  try{
   const value=await send('enablement',undefined,{},abort.signal);
   if(disposed||owner!==epoch||revision!==readEpoch)return false;
   accept(value);return true;
  }catch(error){
   if(!disposed&&owner===epoch&&revision===readEpoch){
    writeAbort?.abort();writeAbort=null;watchAbort?.abort();void reader?.cancel().catch(()=>{});
    publish({connected:false,pending:null,saved:null,readError:['transport-invalid-response','global-settings-unavailable'].includes(error?.code)?error.code:'global-unavailable'});
    clearRetry();timer=setTimer(()=>{timer=null;void watch();},backoff);
   }return false;
  }
  finally{if(!disposed&&owner===epoch&&revision===readEpoch){readAbort=null;publish({loading:false});}}
 }
 async function watch(){
  if(disposed)return;
  const owner=epoch,abort=new AbortController();watchAbort=abort;let ownedReader;
  try{
   const response=await fetcher(ENABLEMENT_PATH,{method:'GET',credentials:'same-origin',signal:abort.signal});
   if(disposed||owner!==epoch||abort.signal.aborted){await response.body?.cancel();return;}
   if(!response.ok||!response.body){await response.body?.cancel();throw invalid();}
   ownedReader=response.body.getReader();reader=ownedReader;const decoder=new TextDecoder('utf-8',{fatal:true});let buffer='';
   const frame=line=>{
    if(!line.trim())return;
    if(line.length>16384)throw invalid();
    let value;try{value=JSON.parse(line);}catch{throw invalid();}
    if(accept(value)){backoff=1000;publish({connected:true,loading:false,readError:null});}
   };
   for(;;){
    const {value,done}=await ownedReader.read();if(disposed||owner!==epoch||abort.signal.aborted)return;
    if(done){buffer+=decoder.decode();if(buffer)frame(buffer);throw new Error('watch-ended');}
    buffer+=decoder.decode(value,{stream:true});let index;
    while((index=buffer.indexOf('\n'))>=0){frame(buffer.slice(0,index));buffer=buffer.slice(index+1);}
    if(buffer.length>16384)throw invalid();
   }
  }catch(error){
   if(!disposed&&owner===epoch&&!abort.signal.aborted){
    writeAbort?.abort();writeAbort=null;
     publish({pending:null,writeError:state.pending?'global-unavailable':state.writeError,connected:false,loading:false,readError:['transport-invalid-response','global-settings-unavailable'].includes(error?.code)?error.code:'global-unavailable',saved:null});
    clearRetry();timer=setTimer(()=>{timer=null;void watch();},backoff);backoff=Math.min(30000,backoff*2);
   }
  }finally{
   try{await ownedReader?.cancel();}catch{}try{ownedReader?.releaseLock();}catch{}
   if(reader===ownedReader)reader=null;if(watchAbort===abort)watchAbort=null;
  }
 }
 async function configure(feature,config,expectedRevision,signal){
   if(disposed||state.pending||!state.connected||!Number.isSafeInteger(state.data?.settingsRevision)||!FEATURES.includes(feature)||signal?.aborted)return false;
   if(expectedRevision!==state.data.settingsRevision){publish({writeError:'stale-global-settings',saved:null});return false;}
   const owner=epoch,abort=new AbortController();writeAbort=abort;
   const cancel=()=>{abort.abort();if(!disposed&&owner===epoch&&writeAbort===abort){writeAbort=null;publish({pending:null,saved:null});}};signal?.addEventListener('abort',cancel,{once:true});
   publish({pending:feature,writeError:null,saved:null});
   try{
    const value=await send('save-global',undefined,{feature,config:sessionSettings(config),expectedRevision},abort.signal);
    if(disposed||owner!==epoch||abort.signal.aborted||!state.connected)return false;
    accept(value);
    if(!state.data.configured[feature]||JSON.stringify(state.data.settings[feature])!==JSON.stringify(sessionSettings(config))){publish({writeError:'stale-global-settings'});await load();return false;}
    publish({saved:{feature,kind:'settings',settingsRevision:state.data.settingsRevision}});return true;
   }catch(error){
    if(!disposed&&owner===epoch&&!abort.signal.aborted){
     const code=error?.code;publish({writeError:['stale-global-settings','global-settings-unavailable','global-unavailable','forbidden'].includes(code)?code:'global-save-failed'});
     if(code==='stale-global-settings')await load();
    }return false;
   }finally{signal?.removeEventListener('abort',cancel);if(!disposed&&owner===epoch&&writeAbort===abort){writeAbort=null;publish({pending:null});}}
  }
  async function setEnabled(feature,enabled){
  if(disposed||state.pending||!state.connected||!state.data||!FEATURES.includes(feature)||typeof enabled!=='boolean')return false;
  const owner=epoch,expectedRevision=state.data.revision,abort=new AbortController();writeAbort=abort;
  publish({pending:feature,writeError:null,saved:null});
  try{
   const value=await send('set-enabled',undefined,{feature,enabled,expectedRevision},abort.signal);
   if(disposed||owner!==epoch||abort.signal.aborted||!state.connected)return false;
   accept(value);
   if(state.data.enabled[feature]!==enabled){publish({writeError:'stale-enablement'});await load();return false;}
   publish({saved:{feature,revision:state.data.revision}});return true;
  }catch(error){
   if(!disposed&&owner===epoch&&!abort.signal.aborted){
    const stale=error?.code==='stale-enablement';publish({writeError:stale?'stale-enablement':'global-save-failed'});
    if(stale)await load();
   }
   return false;
  }finally{if(!disposed&&owner===epoch&&writeAbort===abort){writeAbort=null;publish({pending:null});}}
 }
 return {
  getSnapshot:()=>state,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  start(){if(!disposed)return Promise.resolve(false);disposed=false;epoch++;publish({connected:false,pending:null,saved:null});void watch();return load();},
  load,setEnabled,configure,
  dispose(){disposed=true;epoch++;readEpoch++;clearRetry();readAbort?.abort();writeAbort?.abort();watchAbort?.abort();void reader?.cancel().catch(()=>{});readAbort=null;writeAbort=null;watchAbort=null;reader=null;state={...state,connected:false,pending:null,saved:null};},
 };
}
