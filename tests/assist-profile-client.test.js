import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createEnablementSource,normalizeEnablement,mergeGlobalSettings,createEnablementObserver} from '../assist/client/enablement-source.js';
import {createSettingsDraft,editSettingsDraft,syncSettingsDraft,acceptSettingsSave,matchesSettingsSave} from '../assist/client/settings-page-state.js';
import {sessionSettings,errorKey} from '../assist/client/api.js';
import {SettingsPage} from '../assist/client/settings-page.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const snap=(revision=3,settingsRevision=7)=>({scope:'profile',revision,enabled:{suggest:true,enhance:false},settingsRevision,settings:{suggest:sessionSettings({rounds:3}),enhance:sessionSettings({rounds:5})},configured:{suggest:true,enhance:true}});
function harness(handler){
 const calls=[],streams=[],timers=[];
 let current=snap();
 const source=createEnablementSource({send:(...args)=>{calls.push(args);return handler?handler(...args):Promise.resolve(current);},fetcher:async()=>({ok:true,body:new ReadableStream({start(sink){streams.push(sink);}})}),setTimer:fn=>{timers.push(fn);return timers.length;},clearTimer(){}});
 return {source,calls,streams,timers,set current(value){current=value;},async start(){await source.start();await tick();this.frame(current);await tick();},frame(value,index=streams.length-1){streams[index].enqueue(new TextEncoder().encode(JSON.stringify(value)+'\n'));}};
}
test('combined snapshots are immutable; legacy Host flags fail closed with default controls',()=>{
 const old=normalizeEnablement({scope:'profile',revision:4,enabled:{suggest:true,enhance:true}});
 assert.equal(old.settingsRevision,null);assert.deepEqual(old.configured,{suggest:false,enhance:false});
 const merged=mergeGlobalSettings({suggest:{model:'legacy',rounds:19,fast:true}},{connected:true,data:old});
 assert.deepEqual(merged.suggest,{...sessionSettings(),enabled:false});
 const value=normalizeEnablement(snap());assert.ok(Object.isFrozen(value.settings.suggest));
 for(const patch of [{settingsRevision:-1},{configured:{suggest:1,enhance:true}},{settings:{suggest:{},enhance:{}}}])assert.throws(()=>normalizeEnablement({...snap(),...patch}));
});
test('independent flag and controls revisions advance without rolling back the other component',async()=>{
 const h=harness();await h.start();h.frame(snap(3,8));await tick();assert.equal(h.source.getSnapshot().data.settingsRevision,8);
 h.frame(snap(4,7));await tick();assert.equal(h.source.getSnapshot().data.revision,4);assert.equal(h.source.getSnapshot().data.settingsRevision,8);
 h.frame(snap(2,9));await tick();assert.equal(h.source.getSnapshot().data.settingsRevision,9);assert.equal(h.source.getSnapshot().data.revision,4);
 h.frame(snap(4,9));await tick();assert.equal(h.source.getSnapshot().data.revision,4);assert.equal(h.source.getSnapshot().data.settingsRevision,9);h.source.dispose();
});
test('same settings revision cannot carry conflicting controls or configured state',async()=>{
 for(const patch of [{settings:{...snap().settings,suggest:sessionSettings({rounds:9})}},{configured:{suggest:false,enhance:true}}]){
  const h=harness();await h.start();h.frame({...snap(4,7),...patch});await tick();assert.equal(h.source.getSnapshot().connected,false);assert.equal(h.source.getSnapshot().readError,'transport-invalid-response');assert.equal(h.source.getSnapshot().data.settings.suggest.rounds,3);h.source.dispose();
 }
});
test('global save is sessionless, serializes all writes, and uses the supplied draft revision',async()=>{
 const response=defer(),h=harness(action=>action==='save-global'?response.promise:Promise.resolve(snap()));await h.start();
 const config=sessionSettings({rounds:9});const saving=h.source.configure('enhance',config,7);
 assert.equal(await h.source.configure('suggest',config,7),false);assert.equal(await h.source.setEnabled('enhance',true),false);
 assert.deepEqual(h.calls[1].slice(0,3),['save-global',undefined,{feature:'enhance',config,expectedRevision:7}]);
 response.resolve({...snap(3,8),settings:{...snap().settings,enhance:config}});assert.equal(await saving,true);assert.equal(h.source.getSnapshot().data.settings.enhance.rounds,9);assert.equal(h.source.getSnapshot().pending,null);h.source.dispose();
});
test('old draft CAS is rejected locally instead of silently taking the newest revision',async()=>{
 const h=harness();await h.start();h.frame(snap(3,8));await tick();assert.equal(await h.source.configure('suggest',sessionSettings({rounds:9}),7),false);
 assert.equal(h.source.getSnapshot().writeError,'stale-global-settings');assert.deepEqual(h.calls.map(x=>x[0]),['enablement']);h.source.dispose();
});
test('remote settings CAS rejection rereads once and preserves a clear error without resending',async()=>{
 let reads=0;const h=harness(async action=>{if(action==='save-global')throw {code:'stale-global-settings'};return snap(3,reads++?8:7);});await h.start();
 assert.equal(await h.source.configure('suggest',sessionSettings({rounds:9}),7),false);assert.equal(h.source.getSnapshot().data.settingsRevision,8);assert.equal(h.source.getSnapshot().writeError,'stale-global-settings');assert.deepEqual(h.calls.map(x=>x[0]),['enablement','save-global','enablement']);h.source.dispose();
});
test('flag CAS remains independent when controls advance during a flag request',async()=>{
 const response=defer(),h=harness(action=>action==='set-enabled'?response.promise:Promise.resolve(snap()));await h.start();const saving=h.source.setEnabled('enhance',true);
 h.frame(snap(3,8));await tick();response.resolve({...snap(4,7),enabled:{suggest:true,enhance:true}});
 assert.equal(await saving,true);assert.equal(h.calls[1][2].expectedRevision,3);assert.equal(h.source.getSnapshot().data.settingsRevision,8);h.source.dispose();
});
test('disconnect cancels a global save; ignored abort and late result cannot publish',async()=>{
 const response=defer(),h=harness(action=>action==='save-global'?response.promise:Promise.resolve(snap()));await h.start();const saving=h.source.configure('suggest',sessionSettings({rounds:9}),7);
 h.streams[0].close();await tick();assert.equal(h.calls[1][3].aborted,true);assert.equal(h.source.getSnapshot().pending,null);
 response.resolve({...snap(3,8),settings:{...snap().settings,suggest:sessionSettings({rounds:9})}});assert.equal(await saving,false);assert.equal(h.source.getSnapshot().data.settingsRevision,7);assert.equal(h.source.getSnapshot().saved,null);h.source.dispose();
});
test('card abort and StrictMode source restart cannot publish obsolete save completions',async()=>{
 const response=defer(),h=harness(action=>action==='save-global'?response.promise:Promise.resolve(snap()));await h.start();const cancel=new AbortController();const saving=h.source.configure('suggest',sessionSettings({rounds:9}),7,cancel.signal);cancel.abort();
 h.source.dispose();await h.source.start();await tick();h.frame(snap());await tick();response.resolve({...snap(3,8),settings:{...snap().settings,suggest:sessionSettings({rounds:9})}});
 assert.equal(await saving,false);assert.equal(h.source.getSnapshot().data.settingsRevision,7);assert.equal(h.source.getSnapshot().pending,null);h.source.dispose();
});
test('newer controls win over a late successful save and cannot be reported as saved',async()=>{
 const response=defer();let latest=snap();const h=harness(action=>action==='save-global'?response.promise:Promise.resolve(latest));await h.start();
 const requested=sessionSettings({rounds:9});const saving=h.source.configure('suggest',requested,7);
 latest={...snap(3,9),settings:{...snap().settings,suggest:sessionSettings({rounds:11})}};h.frame(latest);await tick();
 response.resolve({...snap(3,8),settings:{...snap().settings,suggest:requested}});assert.equal(await saving,false);assert.equal(h.source.getSnapshot().data.settings.suggest.rounds,11);assert.equal(h.source.getSnapshot().saved,null);assert.equal(h.source.getSnapshot().writeError,'stale-global-settings');h.source.dispose();
});
test('missing controls after a valid snapshot disconnects instead of retaining generation authority',async()=>{
 const h=harness();await h.start();h.frame({scope:'profile',revision:4,enabled:{suggest:true,enhance:true}});await tick();
 assert.equal(h.source.getSnapshot().connected,false);assert.equal(mergeGlobalSettings(null,h.source.getSnapshot()).suggest.enabled,false);assert.equal(await h.source.configure('suggest',sessionSettings(),7),false);h.source.dispose();
});
test('card cancellation frees the source and an older completion cannot clear the new pending save',async()=>{
 const writes=[defer(),defer()];let index=0;const h=harness(action=>action==='save-global'?writes[index++].promise:Promise.resolve(snap()));await h.start();
 const abort=new AbortController();const old=h.source.configure('suggest',sessionSettings({rounds:9}),7,abort.signal);abort.abort();assert.equal(h.source.getSnapshot().pending,null);
 const next=h.source.configure('enhance',sessionSettings({rounds:11}),7);writes[0].resolve(snap(3,8));assert.equal(await old,false);assert.equal(h.source.getSnapshot().pending,'enhance');
 writes[1].resolve({...snap(3,8),settings:{...snap().settings,enhance:sessionSettings({rounds:11})}});assert.equal(await next,true);h.source.dispose();
});
test('unavailable settings reads fail closed and restart the read-only stream',async()=>{
 let failed=false;const h=harness(async()=>{if(failed)throw {code:'global-settings-unavailable'};return snap();});await h.start();failed=true;
 assert.equal(await h.source.load(),false);assert.equal(h.source.getSnapshot().connected,false);assert.equal(h.source.getSnapshot().readError,'global-settings-unavailable');assert.equal(mergeGlobalSettings(null,h.source.getSnapshot()).suggest.enabled,false);
 assert.ok(h.timers.length);h.timers.at(-1)();await tick();h.frame(snap());await tick();assert.equal(h.source.getSnapshot().connected,true);assert.ok(h.calls.every(x=>x[0]==='enablement'));h.source.dispose();
});
test('same settings revision conflict cannot partially advance the flags component',async()=>{
 const h=harness();await h.start();h.frame({...snap(4,7),enabled:{suggest:false,enhance:true},configured:{suggest:false,enhance:true}});await tick();
 assert.equal(h.source.getSnapshot().data.revision,3);assert.equal(h.source.getSnapshot().data.enabled.suggest,true);assert.equal(h.source.getSnapshot().connected,false);h.source.dispose();
});
test('unconfigured feature stays disabled until its global controls are saved',()=>{
 const value={...snap(),configured:{suggest:false,enhance:false}};let merged=mergeGlobalSettings(null,{connected:true,data:value});assert.equal(merged.suggest.enabled,false);
 merged=mergeGlobalSettings(null,{connected:true,data:{...value,configured:{suggest:true,enhance:false}}});assert.equal(merged.suggest.enabled,true);assert.equal(merged.enhance.enabled,false);assert.equal(merged.suggest.rounds,3);
});
test('controls/configured changes and reconnect rebuild QA baseline; feedback alone does not',()=>{
 const events=[],controller={configurationEdited:()=>events.push('cancel'),mount:()=>events.push('baseline'),observe:frame=>events.push(frame.qaId)};const observe=createEnablementObserver(controller);
 observe({qaId:'a'},{connected:true,data:snap()});observe({qaId:'b'},{connected:true,data:snap(3,8)});assert.deepEqual(events,['a','cancel','baseline','b']);
 events.length=0;observe({qaId:'b'},{connected:true,data:snap(3,8),pending:'enhance'});assert.deepEqual(events,['b']);
 events.length=0;observe({qaId:'c'},{connected:true,data:{...snap(3,8),configured:{suggest:false,enhance:true}}});assert.deepEqual(events,['cancel','baseline','c']);
});
test('a superseded boolean save completion never acknowledges another window settings as this draft',()=>{
 const config=sessionSettings({rounds:9}),draft=editSettingsDraft(createSettingsDraft({rounds:3},7),config);
 const confirmed={connected:true,data:{...snap(3,8),settings:{...snap().settings,suggest:config}},saved:{kind:'settings',feature:'suggest',settingsRevision:8}};
 assert.equal(matchesSettingsSave(confirmed,'suggest',config),true);
 for(const later of [
  {...confirmed,data:{...confirmed.data,settingsRevision:9},saved:null},
  {...confirmed,data:{...confirmed.data,settingsRevision:9}},
  {...confirmed,data:{...confirmed.data,settings:{...confirmed.data.settings,suggest:sessionSettings({rounds:11})}}},
  {...confirmed,saved:{...confirmed.saved,feature:'enhance'}},
  {...confirmed,connected:false},
 ]){
  const next=matchesSettingsSave(later,'suggest',config)?acceptSettingsSave(draft,draft.version,later.data.settings.suggest,later.data.settingsRevision):draft;
  assert.equal(next,draft);assert.equal(next.dirty,true);assert.equal(next.settingsRevision,7);assert.equal(next.config.rounds,9);
 }
});
test('clean draft syncs while dirty draft preserves config and base across remote changes',()=>{
 const clean=createSettingsDraft({rounds:3},7);const synced=syncSettingsDraft(clean,{rounds:5},8);assert.equal(synced.config.rounds,5);assert.equal(synced.settingsRevision,8);
 const dirty=editSettingsDraft(clean,{rounds:9});assert.equal(syncSettingsDraft(dirty,{rounds:5},8),dirty);assert.equal(dirty.settingsRevision,7);
 const saved=acceptSettingsSave(dirty,dirty.version,dirty.config,9);assert.equal(saved.settingsRevision,9);assert.equal(saved.dirty,false);
 const newer=editSettingsDraft(dirty,{rounds:11});assert.equal(acceptSettingsSave(newer,dirty.version,dirty.config,9),newer);
});
test('no-session page renders both independent cards even when both flags are disabled',()=>{
 const data={...snap(),enabled:{suggest:false,enhance:false},configured:{suggest:false,enhance:false}},state={data,connected:true,loading:false};const target={sessionId:null};
 const html=renderToStaticMarkup(React.createElement(SettingsPage,{t:key=>key,targetSource:{subscribe:()=>()=>{},getSnapshot:()=>target},globalSource:{subscribe:()=>()=>{},getSnapshot:()=>state},assistSend(){throw Error('SSR cannot call RPC');},useSessionAccess(){throw Error('global controls must not read session access');}}));
 assert.equal((html.match(/type="submit"/g)||[]).length,2);assert.doesNotMatch(html,/<button[^>]*type="submit"[^>]*disabled/);assert.match(html,/settings.unconfigured/);assert.match(html,/settings.modelUnknown/);
 assert.equal(errorKey({code:'stale-global-settings'}),'settings.stale');assert.equal(errorKey({code:'global-settings-unavailable'}),'settings.unavailable');
});
