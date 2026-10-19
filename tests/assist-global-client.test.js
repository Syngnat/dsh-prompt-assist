import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsDraft,editSettingsDraft,acceptSettingsSave} from '../assist/client/settings-page-state.js';
test('session drafts and acknowledgements strip historical enabled without losing unsaved parameters',()=>{
 let draft=createSettingsDraft({enabled:true,rounds:3,model:'saved'});
 assert.equal(Object.hasOwn(draft.config,'enabled'),false);
 draft=editSettingsDraft(draft,{...draft.config,enabled:false,rounds:5});
 assert.equal(Object.hasOwn(draft.config,'enabled'),false);
 const old=acceptSettingsSave(draft,draft.version-1,{enabled:true,rounds:1});assert.equal(old,draft);assert.equal(old.config.rounds,5);
 const saved=acceptSettingsSave(draft,draft.version,{...draft.config,enabled:true});assert.equal(Object.hasOwn(saved.config,'enabled'),false);assert.equal(saved.dirty,false);
});

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const snapshot=(revision=0,suggest=false,enhance=false)=>({scope:'profile',revision,enabled:{suggest,enhance}});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function watchFixture(){let sink,cancelled=false;const body=new ReadableStream({start(controller){sink=controller;},cancel(){cancelled=true;}});return {response:{ok:true,body},send(value){sink.enqueue(new TextEncoder().encode(JSON.stringify(value)+'\n'));},close(){sink.close();},get cancelled(){return cancelled;}};}
test('shared source starts read-only and ignores late older RPC after a newer watch snapshot',async()=>{
 const {createEnablementSource}=await import('../assist/client/enablement-source.js');
 const initial=deferred(),watch=watchFixture(),calls=[];
 const source=createEnablementSource({send:(...args)=>{calls.push(args);return initial.promise;},fetcher:async (url,init)=>{assert.equal(url,'api/local-openai-fast.enablement');assert.equal(init.method,'GET');assert.equal(init.credentials,'same-origin');return watch.response;}});
 const loading=source.start();await tick();watch.send(snapshot(5,true,false));await tick();
 assert.equal(source.getSnapshot().connected,true);assert.equal(source.getSnapshot().data.revision,5);
 initial.resolve(snapshot(2,false,false));await loading;
 assert.equal(source.getSnapshot().data.revision,5);assert.equal(source.getSnapshot().data.enabled.suggest,true);assert.equal(calls.length,1);assert.equal(calls[0][0],'enablement');assert.equal(calls[0][1],undefined);source.dispose();
});

test('settings shows two profile switches even with no selected session',async()=>{
 const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');const {SettingsPage}=await import('../assist/client/settings-page.js');
 const target={sessionId:null},global={data:snapshot(1,true,false),connected:true,loading:false,pending:null,readError:null,writeError:null,saved:null};
 const html=renderToStaticMarkup(React.createElement(SettingsPage,{t:key=>key,targetSource:{getSnapshot:()=>target,subscribe:()=>()=>{}},globalSource:{getSnapshot:()=>global,subscribe:()=>()=>{},setEnabled(){}},returnToConversation(){}}));
 assert.ok(html.includes('global.title'));assert.equal((html.match(/type="checkbox"/g)||[]).length,2);assert.ok(html.includes('settings.sessionEmpty'));
});

import {createEnablementSource,normalizeEnablement,mergeGlobalSettings,createEnablementObserver} from '../assist/client/enablement-source.js';
import {createAssistController} from '../assist/client/controller.js';
import {DEFAULT_SETTINGS,sessionSettings} from '../assist/client/api.js';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {EnablementPanelContent} from '../assist/client/enablement-panel.js';
import {Settings} from '../assist/client/settings.js';
import {dictionaries} from '../assist/client/messages.js';
const globalView=(data,connected=true)=>({data,connected,loading:false,pending:null,readError:null,writeError:null,saved:null});
function harness(handler=async action=>snapshot()){
 const calls=[],streams=[],timers=new Map(),delays=[];let next=0;
 const source=createEnablementSource({send:(...args)=>{calls.push(args);return handler(...args);},fetcher:async(url,init)=>{const stream=watchFixture();streams.push({stream,url,init});return stream.response;},setTimer:(fn,ms)=>{timers.set(++next,fn);delays.push(ms);return next;},clearTimer:id=>timers.delete(id)});
 return {source,calls,streams,timers,delays,async ready(data=snapshot()){await source.start();await tick();streams[0].stream.send(data);await tick();},async reconnect(){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();await tick();}};
}
test('explicit checkbox write uses sessionless CAS; no optimistic update or duplicate write',async()=>{
 const write=deferred(),h=harness(action=>action==='set-enabled'?write.promise:Promise.resolve(snapshot(3)));
 await h.ready(snapshot(3));const pending=h.source.setEnabled('suggest',true);
 assert.equal(h.source.getSnapshot().data.enabled.suggest,false);assert.equal(h.source.getSnapshot().pending,'suggest');
 assert.equal(await h.source.setEnabled('enhance',true),false);
 assert.deepEqual(h.calls[1].slice(0,3),['set-enabled',undefined,{feature:'suggest',enabled:true,expectedRevision:3}]);
 write.resolve(snapshot(4,true));assert.equal(await pending,true);assert.equal(h.source.getSnapshot().saved.revision,4);assert.equal(h.source.getSnapshot().data.enabled.suggest,true);h.source.dispose();
});
test('a newer cross-window snapshot wins over a delayed successful save response',async()=>{
 const write=deferred();let current=snapshot(4);const h=harness(action=>action==='set-enabled'?write.promise:Promise.resolve(current));
 await h.ready(current);const pending=h.source.setEnabled('suggest',true);current=snapshot(6,false,true);h.streams[0].stream.send(current);await tick();
 write.resolve(snapshot(5,true,false));assert.equal(await pending,false);
 assert.equal(h.source.getSnapshot().data.revision,6);assert.equal(h.source.getSnapshot().data.enabled.suggest,false);assert.equal(h.source.getSnapshot().saved,null);assert.equal(h.source.getSnapshot().writeError,'stale-enablement');
 assert.equal(h.calls.filter(x=>x[0]==='set-enabled').length,1);h.source.dispose();
});
test('failed persistence is never shown as saved and does not optimistically enable',async()=>{
 const h=harness(async action=>{if(action==='set-enabled')throw Object.assign(Error('private detail'),{code:'save-failed'});return snapshot(1);});await h.ready(snapshot(1));
 assert.equal(await h.source.setEnabled('suggest',true),false);const state=h.source.getSnapshot();assert.equal(state.saved,null);assert.equal(state.data.enabled.suggest,false);assert.equal(state.writeError,'global-save-failed');assert.equal(h.calls.length,2);h.source.dispose();
});
test('stale CAS automatically rereads but never resends the write',async()=>{
 let reads=0;const h=harness(async action=>{if(action==='set-enabled')throw Object.assign(Error('stale'),{code:'stale-enablement'});return ++reads===1?snapshot(1):snapshot(2,false,true);});await h.ready(snapshot(1));
 await h.source.setEnabled('suggest',true);assert.equal(h.source.getSnapshot().data.revision,2);assert.equal(h.source.getSnapshot().writeError,'stale-enablement');assert.deepEqual(h.calls.map(x=>x[0]),['enablement','set-enabled','enablement']);h.source.dispose();
});
test('disconnect fails closed and read-only reconnection never trusts old session enabled',async()=>{
 const h=harness(async()=>snapshot(2,true,true));await h.ready(snapshot(2,true,true));
 const legacy={suggest:{...DEFAULT_SETTINGS,enabled:true},enhance:{...DEFAULT_SETTINGS,enabled:true}};
 assert.equal(mergeGlobalSettings(legacy,h.source.getSnapshot()).suggest.enabled,true);
 h.streams[0].stream.close();await tick();assert.equal(h.source.getSnapshot().connected,false);assert.equal(mergeGlobalSettings(legacy,h.source.getSnapshot()).suggest.enabled,false);
 assert.equal(await h.source.setEnabled('suggest',false),false);assert.equal(h.delays[0],1000);
 await h.source.load();assert.equal(h.source.getSnapshot().connected,false);await h.reconnect();h.streams[1].stream.send(snapshot(2,true,true));await tick();assert.equal(h.source.getSnapshot().connected,true);
 assert.ok(h.calls.every(x=>x[0]==='enablement'));assert.ok(h.streams.every(x=>x.init.method==='GET'));h.source.dispose();assert.equal(h.timers.size,0);
});
test('watch retry backoff is bounded and dispose cancels all pending read resources',async()=>{
 const timers=new Map(),delays=[];let id=0,fetches=0;
 const source=createEnablementSource({send:async()=>snapshot(),fetcher:async()=>{fetches++;throw Error('offline');},setTimer:(fn,ms)=>{timers.set(++id,fn);delays.push(ms);return id;},clearTimer:id=>timers.delete(id)});
 await source.start();await tick();for(let i=0;i<8;i++){const [key,fn]=timers.entries().next().value;timers.delete(key);fn();await tick();}
 assert.equal(Math.max(...delays),30000);assert.ok(delays.every(x=>x>=1000));source.dispose();assert.equal(timers.size,0);assert.equal(fetches,9);
});
test('malformed snapshots and same-revision conflicts fail closed without mutating last confirmed state',async()=>{
 for(const value of [null,{},snapshot(-1),snapshot(1.5),{...snapshot(),scope:'session'},{...snapshot(),enabled:{suggest:1,enhance:false}}])assert.throws(()=>normalizeEnablement(value));
 const h=harness(async()=>snapshot(5,true));await h.ready(snapshot(5,true));h.streams[0].stream.send(snapshot(5,false));await tick();assert.equal(h.source.getSnapshot().connected,false);assert.equal(h.source.getSnapshot().data.enabled.suggest,true);assert.equal(h.source.getSnapshot().readError,'transport-invalid-response');h.source.dispose();
});
test('lower watch revisions cannot overwrite newer data',async()=>{
 const h=harness(async()=>snapshot(8,true,true));await h.ready(snapshot(8,true,true));h.streams[0].stream.send(snapshot(6,false,false));await tick();assert.equal(h.source.getSnapshot().data.revision,8);assert.equal(h.source.getSnapshot().data.enabled.enhance,true);h.source.dispose();
});
test('late save and read replies after plugin disposal cannot publish',async()=>{
 const write=deferred(),h=harness(action=>action==='set-enabled'?write.promise:Promise.resolve(snapshot()));await h.ready();let notifications=0;h.source.subscribe(()=>notifications++);
 const saving=h.source.setEnabled('enhance',true),before=notifications;h.source.dispose();write.resolve(snapshot(1,false,true));await saving;assert.equal(notifications,before);assert.equal(h.source.getSnapshot().data.revision,0);assert.equal(h.calls[1][3].aborted,true);await tick();assert.equal(h.streams[0].stream.cancelled,true);
});
function sessionController(id,global){
 const calls=[],changes=[],input={draft:'',draftRev:1,phase:'plain',occurrences:[],attachmentIds:[]};
 const controller=createAssistController({actions:()=>({captureInsertion:()=>({start:0,end:input.draft.length,draftRev:1})}),publish:value=>changes.push(value),requestId:()=>id,send:(action,session,payload,signal)=>{const wait=deferred();calls.push({action,session,payload,signal,wait});return wait.promise;}});
 const observe=createEnablementObserver(controller);let qaId='1:2';
 const update=(g=global,qa=qaId)=>{global=g;qaId=qa;observe({sessionId:id,input,settings:mergeGlobalSettings({suggest:{...DEFAULT_SETTINGS,enabled:true},enhance:{...DEFAULT_SETTINGS,enabled:true}},global),qaId,busy:false,paused:false,routeKey:'route'},global);};
 return {controller,calls,changes,input,update};
}
test('existing and new sessions inherit switches, cancel old work, and never replay QA on enabling',async()=>{
 const off=globalView(snapshot(0)),on=globalView(snapshot(1,true,true));const a=sessionController('existing',off);a.update();a.update(off,'3:4');a.update(on);assert.equal(a.calls.length,0);
 const b=sessionController('new-session',on);b.update(on,'3:4');assert.equal(b.calls.length,0);
 a.update(on,'5:6');b.update(on,'5:6');assert.equal(a.calls.length,1);assert.equal(b.calls.length,1);
 const disabled=globalView(snapshot(2,false,true));a.update(disabled);b.update(disabled);assert.equal(a.calls[0].signal.aborted,true);assert.equal(b.calls[0].signal.aborted,true);
 const enabled=globalView(snapshot(3,true,true));a.update(enabled);b.update(enabled);assert.equal(a.calls.length,1);assert.equal(b.calls.length,1);
 for(const f of [a,b]){const c=f.calls[0];c.wait.resolve({...c.payload,original:'',text:'stale'});await tick();assert.equal(f.changes.at(-1).preview,null);f.controller.dispose();}
});
test('reconnect with advanced QA is a fresh baseline, not a billable replay',()=>{
 const live=globalView(snapshot(1,true,true)),f=sessionController('session',live);f.update();f.update({...live,connected:false},'3:4');f.update(live,'5:6');assert.equal(f.calls.length,0);f.update(live,'7:8');assert.equal(f.calls.length,1);f.controller.dispose();
});
test('even a batched off/on revision invalidates pending work with equal final enabled values',()=>{
 const f=sessionController('session',globalView(snapshot(1,true,true)));f.update();f.update(undefined,'3:4');assert.equal(f.calls.length,1);f.update(globalView(snapshot(3,true,true)));assert.equal(f.calls[0].signal.aborted,true);assert.equal(f.calls.length,1);f.controller.dispose();
});
test('unknown or disconnected globals override legacy wire/session enabled but preserve model parameters',()=>{
 const params={...DEFAULT_SETTINGS,enabled:true,provider:'custom',model:'m',rounds:9};for(const global of [undefined,globalView(snapshot(4,true,true),false),globalView(snapshot(5,false,false))]){
  const merged=mergeGlobalSettings({suggest:params,enhance:params},global);assert.equal(merged.suggest.enabled,false);assert.equal(merged.suggest.model,'m');assert.equal(merged.suggest.rounds,9);
 }
 assert.deepEqual(Object.keys(sessionSettings(params)),['followSession','provider','model','reasoningEffort','fast','rounds']);
});
for(const lang of ['zh','en'])test('SSR '+lang+' separates global immediate-save controls and session parameters',()=>{
 const t=key=>{assert.equal(typeof dictionaries[lang][key],'string',key);return dictionaries[lang][key];};
 const html=renderToStaticMarkup(React.createElement(EnablementPanelContent,{snapshot:globalView(snapshot(1,true,false)),t}));
 assert.equal((html.match(/type="checkbox"/g)||[]).length,2);for(const key of ['global.scope','global.charge','global.migration'])assert.ok(html.includes(t(key).replaceAll('&','&amp;')));
 const form=renderToStaticMarkup(React.createElement(Settings,{t,config:sessionSettings({...DEFAULT_SETTINGS,enabled:true}),catalog:{providers:[],models:[]},allowed:true,onChange(){},save(){}}));
 assert.ok(!form.includes('>'+t('enabled')+'</label>'));assert.ok(form.includes(t('follow')));
 const failed=renderToStaticMarkup(React.createElement(EnablementPanelContent,{snapshot:{...globalView(snapshot()),writeError:'global-save-failed'},t}));assert.ok(failed.includes(t('global.saveFailed')));assert.ok(!failed.includes(t('global.saved')));
});

test('non-OK watch responses release their response body before scheduling reconnection',async()=>{
 const stream=watchFixture(),timers=[];
 const source=createEnablementSource({send:async()=>snapshot(),fetcher:async()=>({...stream.response,ok:false}),setTimer:fn=>{timers.push(fn);return timers.length;},clearTimer(){}});
 await source.start();await tick();assert.equal(stream.cancelled,true);assert.equal(source.getSnapshot().connected,false);source.dispose();
});
