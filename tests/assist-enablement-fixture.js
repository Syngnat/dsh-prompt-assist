import { normalizeConfig } from '../assist/config.js';
const controls = input => {const {enabled:_ignored,...config}=normalizeConfig(input);return Object.freeze(config);};
/** Explicit, already-confirmed global defaults for offline runtime tests. Never reads session projections. */
export function fixtureEnablement(enabled={suggest:true,enhance:true}, settings={}) {
 let snapshot=Object.freeze({scope:'profile',revision:0,enabled:Object.freeze({...enabled}),settingsRevision:0,
  settings:Object.freeze({suggest:controls(settings.suggest),enhance:controls(settings.enhance)}),configured:Object.freeze({suggest:true,enhance:true})});
 const listeners=new Set(),notify=()=>{for(const listener of listeners)listener(snapshot);};
 return {getSnapshot:()=>snapshot,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  async set(feature,value,{signal,expectedRevision}={}) {
   signal?.throwIfAborted();if(expectedRevision!==undefined&&expectedRevision!==snapshot.revision)throw Object.assign(Error('stale-enablement'),{code:'stale-enablement'});
   if(snapshot.enabled[feature]===value)return snapshot;
   snapshot=Object.freeze({...snapshot,revision:snapshot.revision+1,enabled:Object.freeze({...snapshot.enabled,[feature]:value})});notify();return snapshot;
  },
  async configure(feature,input,{signal,expectedRevision}={}) {
   signal?.throwIfAborted();if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Object.assign(Error('invalid-request'),{code:'invalid-request'});
   if(expectedRevision!==snapshot.settingsRevision)throw Object.assign(Error('stale-global-settings'),{code:'stale-global-settings'});
   const config=controls(input);if(JSON.stringify(config)===JSON.stringify(snapshot.settings[feature]))return snapshot;
   snapshot=Object.freeze({...snapshot,settingsRevision:snapshot.settingsRevision+1,settings:Object.freeze({...snapshot.settings,[feature]:config})});notify();return snapshot;
  },async close(){listeners.clear();}};
}
