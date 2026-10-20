import test from 'node:test';
import assert from 'node:assert/strict';
import { AssistRuntime } from '../assist/runtime.js';
import { installAssistRpc } from '../assist/rpc-transport.js';
import { ASSIST_ENDPOINT } from '../assist/identity.js';
import { fixtureEnablement } from './assist-enablement-fixture.js';
import { initialContextState } from '../assist/context.js';

const request = (changes={}) => ({action:'save-note',provider:'网关/Case',model:'组织/Model/预览',text:'one line',expectedRevision:0,...changes});
const noteCodes = ['invalid-note-key','invalid-note','stale-model-notes','too-many-model-notes','model-notes-unavailable'];
function fixture(t) {
 let snapshot=Object.freeze({...fixtureEnablement().getSnapshot(),notesRevision:0,notes:Object.freeze({}),notesAvailable:true});
 const listeners=new Set(),calls=[],hooks={};
 const publish=patch=>{snapshot=Object.freeze({...snapshot,...patch});for(const listener of listeners)listener(snapshot);return snapshot;};
 const store={getSnapshot:()=>snapshot,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async saveNote(...args){calls.push(args);await hooks.save?.();return snapshot;}};
 const ctx={get(){throw Error('notes must not access host services');},agents:{get(){throw Error('global notes need no session resolution');}},llm:{prepareCall(){throw Error('model calls forbidden');}}};
 const runtime=new AssistRuntime(ctx,{},[],()=>{throw Error('messages forbidden');},store);t.after(()=>runtime.dispose());
 return {runtime,store,calls,hooks,publish,ctx};
}

test('owner UI saves use separate exact provider/model fields and accept the common envelope',async t=>{
 const f=fixture(t),controller=new AbortController(),input=request({sessionId:''});
 const result=await f.runtime.dispatch(input,{fromUI:true,signal:controller.signal});assert.strictEqual(result,f.store.getSnapshot());
 assert.deepEqual(f.calls,[[input.provider,input.model,input.text,{expectedRevision:0,signal:controller.signal}]]);
 await f.runtime.saveNote(request({action:undefined,sessionId:'session-a'}),{fromUI:true});assert.equal(f.calls.length,2);
});

test('tools, absent UI authority, truthy substitutes and subagents cannot save notes',async t=>{
 const f=fixture(t);
 for(const options of [{},{fromUI:false},{fromUI:1},{fromUI:'true'},{agent:{session:{header:{origin:'main'}}}},{fromUI:true,agent:{session:{header:{origin:'subagent'}}}}]) {
  await assert.rejects(f.runtime.dispatch(request(),options),{code:'forbidden'});
 }
 assert.equal(f.calls.length,0);
});

test('save-note rejects missing and extra fields without accepting the ambiguous legacy key',async t=>{
 const f=fixture(t),options={fromUI:true};
 for(const field of ['provider','model','text','expectedRevision']) {const input=request();delete input[field];await assert.rejects(f.runtime.dispatch(input,options),{code:'invalid-request'});}
 for(const field of ['key','feature','config','enabled','notes','notesRevision','fromUI','agent','signal'])await assert.rejects(f.runtime.dispatch(request({[field]:'extra'}),options),{code:'invalid-request'});
 for(const sessionId of [null,42,{},'s'.repeat(181)])await assert.rejects(f.runtime.dispatch(request({sessionId}),options),{code:'invalid-request'});
 for(const expectedRevision of [undefined,null,-1,0.5,'0',Number.MAX_SAFE_INTEGER+1])await assert.rejects(f.runtime.dispatch(request({expectedRevision}),options),{code:'invalid-request'});
 await assert.rejects(f.runtime.dispatch({action:'save-note',key:'p/m',text:'x',expectedRevision:0},options),{code:'invalid-request'});
 await assert.rejects(f.runtime.saveNote(request({action:'save-global'}),options),{code:'invalid-request'});
 assert.equal(f.calls.length,0);
});

test('wire validation bounds each ID without normalizing case, slashes or Unicode',async t=>{
 const f=fixture(t),options={fromUI:true};
 for(const field of ['provider','model'])for(const value of ['',null,undefined,42,{},'x'.repeat(201)])await assert.rejects(f.runtime.dispatch(request({[field]:value}),options),{code:'invalid-note-key'});
 for(const text of [null,42,{},undefined])await assert.rejects(f.runtime.dispatch(request({text}),options),{code:'invalid-note'});
 await f.runtime.dispatch(request({provider:'p'.repeat(200),model:'m'.repeat(200)}),options);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0][0].length,200);assert.equal(f.calls[0][1].length,200);
});

test('stale notes are rejected once and unavailable notes never reach the write method',async t=>{
 const f=fixture(t);f.publish({notesRevision:1});
 await assert.rejects(f.runtime.dispatch(request(),{fromUI:true}),{code:'stale-model-notes'});assert.equal(f.calls.length,0);
 f.hooks.save=()=>{throw Object.assign(Error('PRIVATE_CONFLICT'),{code:'stale-model-notes'});};
 await assert.rejects(f.runtime.dispatch(request({expectedRevision:1}),{fromUI:true}),{code:'stale-model-notes'});assert.equal(f.calls.length,1);
 f.publish({notesAvailable:false});await assert.rejects(f.runtime.dispatch(request(),{fromUI:true}),{code:'model-notes-unavailable'});assert.equal(f.calls.length,1);
 f.publish({notesAvailable:true});delete f.store.saveNote;
 await assert.rejects(f.runtime.dispatch(request({expectedRevision:1}),{fromUI:true}),{code:'model-notes-unavailable'});
 const closed=new AssistRuntime({}, {}, [], ()=>{}, undefined);t.after(()=>closed.dispose());
 const snapshot=closed.globalEnablement();assert.equal(snapshot.notesRevision,0);assert.equal(snapshot.notesAvailable,false);assert.ok(Object.isFrozen(snapshot.notes));
 await assert.rejects(closed.dispatch(request(),{fromUI:true}),{code:'model-notes-unavailable'});
});

test('notes-only publications preserve effective configs, jobs, cached results and controls revisions',async t=>{
 const f=fixture(t),before=f.store.getSnapshot(),configs=f.runtime.settingsOf({}),controllers=[];
 for(const session of ['a','b'])for(const feature of ['suggest','enhance']) {
  const controller=new AbortController(),key=session+':'+feature;controllers.push(controller);
  f.runtime.jobs.set(key,{controller});f.runtime.cache.set(key,Object.freeze({text:key}));
 }
 const cached=[...f.runtime.cache.entries()];
 f.hooks.save=()=>f.publish({notesRevision:1,notes:Object.freeze({[JSON.stringify(['p','m'])]:'saved'})});
 await f.runtime.dispatch(request(),{fromUI:true});f.publish({notesAvailable:false});
 assert.ok(controllers.every(controller=>!controller.signal.aborted));assert.deepEqual([...f.runtime.cache.entries()],cached);
 for(const feature of ['suggest','enhance'])assert.strictEqual(f.runtime.settingsOf({})[feature],configs[feature]);
 assert.equal(f.store.getSnapshot().revision,before.revision);assert.equal(f.store.getSnapshot().settingsRevision,before.settingsRevision);
 assert.strictEqual(f.store.getSnapshot().settings,before.settings);assert.strictEqual(f.store.getSnapshot().configured,before.configured);
});

test('saving notes during active generation preserves both sessions and their completed results',{timeout:2000},async t=>{
 const f=fixture(t),state=initialContextState({},0),signals=[];let release,ready;
 const gate=new Promise(done=>release=done),started=new Promise(done=>ready=done);
 const metadata={context:{contextWindow:1000000},reasoning:{efforts:[]}};
 f.runtime.ctx={agents:{withInitiator:(_agent,fn)=>fn()},get:name=>name==='tokenMeter'?{estimateMessage:()=>10}:undefined,
  sessionProjections:{stateOf:()=>state},llm:{resolveModelInfo:async()=>metadata,async prepareCall(config){return {config,context:metadata.context,async *stream(options){signals.push(options.signal);if(signals.length===2)ready();await gate;yield {type:'text-delta',text:'complete'};yield {type:'finish',reason:{kind:'stop'}};}};}}};
 f.runtime.fastService={selection:()=>({provider:'fixture',model:'offline'}),enabled:()=>false};f.runtime.createUserMessage=value=>({...value,role:'user'});
 const calls=['a','b'].map(id=>f.runtime.dispatch({action:'generate',feature:'enhance',draft:'draft',draftRev:1},{agent:{id,session:{id,header:{}}}}));
 await started;
 try {
  f.hooks.save=()=>f.publish({notesRevision:1,notes:Object.freeze({[JSON.stringify(['p','m'])]:'saved'})});
  await f.runtime.dispatch(request(),{fromUI:true});f.publish({notesAvailable:false});
  assert.ok(signals.every(signal=>!signal.aborted));assert.equal(f.runtime.jobs.size,2);
  release();const results=await Promise.all(calls);assert.deepEqual(results.map(result=>result.text),['complete','complete']);
  assert.equal(f.runtime.jobs.size,0);assert.equal(f.runtime.cache.size,2);assert.equal(f.store.getSnapshot().settingsRevision,0);
 } finally {release();await Promise.allSettled(calls);}
});

test('native RPC keeps safe note errors and strips all raw failure prose',async t=>{
 const f=fixture(t);let route;
 f.ctx.connection={fetch:{register(spec){route=spec;return()=>{};}}};installAssistRpc(f.ctx,f.runtime);
 const post=async()=>{
  const response=await route.fetch(new Request('http://dsh.internal'+route.path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'notes-1',method:ASSIST_ENDPOINT,payload:request({sessionId:''})})}));
  return response.json();
 };
 for(const code of noteCodes) {
  assert.equal(f.runtime.errorCode({code,message:'PRIVATE_TOKEN'}),code);
  f.hooks.save=()=>{throw Object.assign(Error('PRIVATE_TOKEN'),{code});};
  assert.deepEqual(await post(),{type:'server-response',rpcId:'notes-1',result:{ok:false,error:{code,message:code,details:{}}}});
 }
 f.hooks.save=()=>{throw Object.assign(Error('PRIVATE_TOKEN'),{code:'PRIVATE_ERROR'});};
 const result=await post();assert.equal(result.result.error.code,'model-failed');assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
 f.hooks.save=()=>{throw new DOMException('PRIVATE_ABORT','AbortError');};assert.equal((await post()).result.error.code,'cancelled');
});
