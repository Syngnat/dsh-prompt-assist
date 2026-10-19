import test from 'node:test';
import assert from 'node:assert/strict';
import {AssistRuntime} from '../assist/runtime.js';
import {initialContextState,foldContextState} from '../assist/context.js';
import {normalizeConfig} from '../assist/config.js';
import {fixtureEnablement} from './assist-enablement-fixture.js';
const switches=()=>fixtureEnablement({suggest:false,enhance:false});
function fixture(t,store=switches()){
 const agents=new Map(),states=new Map(),commands=[],streams=[];let seq=0;
 const make=id=>{const a={id,session:{id,header:{}}};agents.set(id,a);states.set(id,initialContextState({},0));return a;};
 const a=make('a'),b=make('b');const hooks={};
 const metadata={context:{contextWindow:1000000},reasoning:{defaultEffort:'high',efforts:[{id:'high',name:'high'}]}};
 const ctx={agents:{get:id=>agents.get(id),withInitiator:(_a,fn)=>fn()},get:name=>name==='tokenMeter'?{estimateMessage:m=>Math.ceil(m.content[0].text.length/4)+8}:undefined,sessionProjections:{stateOf:s=>states.get(s.id)},commands:{async execute(agent,line){commands.push(line);const input=JSON.parse(line.slice(line.indexOf(' ')+1)),id='c'+seq;let s=foldContextState(states.get(agent.id),{seq:seq++,type:'command/run',data:{name:line.slice(1,line.indexOf(' ')),args:JSON.stringify(input),commandId:id}});s=foldContextState(s,{seq:seq++,type:'command/done',data:{commandId:id,kind:'success'}});states.set(agent.id,s);return {result:{kind:'success'}};}},llm:{listProviders:()=>[{id:'openai'}],resolveModelInfo:async()=>metadata,async prepareCall(config){return {config:{...config,reasoningEffort:config.reasoningEffort??'high'},context:metadata.context,async *stream(options){streams.push(options);await hooks.stream?.(options);yield {type:'text-delta',text:'complete'};yield {type:'finish',reason:{kind:'stop'}};}};}}};
 const fast={selection:()=>({provider:'openai',model:'fixture'}),enabled:()=>false};
 const runtime=new AssistRuntime(ctx,fast,['openai'],value=>({...value,role:'user'}),store);t.after(()=>runtime.dispose());
 const generate=(agent=a)=>runtime.dispatch({action:'generate',feature:'enhance',draft:'draft',draftRev:1},{agent});
 return {runtime,store,states,agents,a,b,make,commands,streams,hooks,generate};
}
test('one profile toggle enables existing and new conversations without session commands',async t=>{
 const f=fixture(t);const value=await f.runtime.dispatch({action:'set-enabled',feature:'enhance',enabled:true});assert.equal(value.enabled.enhance,true);
 for(const agent of [f.a,f.b,f.make('new')])assert.equal(f.runtime.state(agent).settings.enhance.enabled,true);
 assert.equal(f.commands.length,0);assert.equal(f.streams.length,0);
});
test('legacy per-session flags cannot enable global features or override global off',async t=>{
 const f=fixture(t);f.states.get('a').settings.enhance=normalizeConfig({enabled:true});assert.equal(f.runtime.state(f.a).settings.enhance.enabled,false);
 await assert.rejects(f.generate(),{code:'disabled'});assert.equal(f.streams.length,0);
});
test('global controls save preserves enablement and updates every conversation without session commands',async t=>{
 const f=fixture(t);await f.store.set('enhance',true);
 await f.runtime.dispatch({action:'save-global',feature:'enhance',expectedRevision:0,config:normalizeConfig({enabled:false,followSession:false,provider:'openai',model:'custom',rounds:5})});
 for(const agent of [f.a,f.b,f.make('new')]) {const settings=f.runtime.state(agent).settings.enhance;assert.equal(settings.enabled,true);assert.equal(settings.model,'custom');assert.equal(settings.rounds,5);}
 assert.equal(f.store.getSnapshot().revision,1);assert.equal(f.store.getSnapshot().settingsRevision,1);assert.equal(f.commands.length,0);
});
test('global off cancels that feature in every conversation and prevents cache reuse',{timeout:2000},async t=>{
 const f=fixture(t);await f.store.set('enhance',true);assert.equal(f.runtime.state(f.a).settings.enhance.enabled,true);let count=0,release;const started=new Promise(resolve=>release=resolve);
 f.hooks.stream=async options=>{if(++count===2)release();await new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));};
 const calls=[f.generate(f.a).catch(e=>e),f.generate(f.b).catch(e=>e)];await started;await f.store.set('enhance',false);const errors=await Promise.all(calls);assert.ok(errors.every(e=>f.runtime.errorCode(e)==='cancelled'));assert.equal(f.runtime.jobs.size,0);assert.equal(f.runtime.cache.size,0);await assert.rejects(f.generate(f.make('later')),{code:'disabled'});
});
test('global enablement cannot be changed by a subagent and reads need no conversation',async t=>{
 const f=fixture(t);assert.equal((await f.runtime.dispatch({action:'enablement'})).scope,'profile');
 await assert.rejects(f.runtime.dispatch({action:'set-enabled',feature:'suggest',enabled:true},{agent:{id:'child',session:{header:{origin:'subagent'}}}}),{code:'forbidden'});assert.equal(f.store.getSnapshot().revision,0);
});

test('releasing or recreating a session/runtime never resets the persisted profile choices',async t=>{const store=switches(),first=fixture(t,store);await first.runtime.dispatch({action:'set-enabled',feature:'suggest',enabled:true});first.runtime.release('a');first.runtime.dispose();const restarted=fixture(t,store);assert.equal(restarted.runtime.state(restarted.make('fresh')).settings.suggest.enabled,true);assert.equal(restarted.runtime.state(restarted.b).settings.enhance.enabled,false);assert.equal(restarted.commands.length,0);assert.equal(restarted.streams.length,0);});
test('replaying old enabled commands never mutates profile authorization',async t=>{const f=fixture(t);const config=normalizeConfig({enabled:true});let state=f.states.get('a');state=foldContextState(state,{type:'command/run',seq:1,data:{name:'prompt-assist-config-v2',commandId:'old',args:JSON.stringify({feature:'suggest',config})}});state=foldContextState(state,{type:'command/done',seq:2,data:{commandId:'old',kind:'success'}});f.states.set('a',state);assert.equal(state.settings.suggest.enabled,true);assert.equal(f.runtime.state(f.a).settings.suggest.enabled,false);assert.equal(f.store.getSnapshot().revision,0);});
test('a global change cancels only that feature and leaves independent in-flight work intact',{timeout:2000},async t=>{const f=fixture(t);await f.store.set('enhance',true);await f.store.set('suggest',true);const s=f.states.get('b');s.qaId='0:3';s.rounds=[{id:'0:3',question:'q',answer:'a',truncated:false}];let n=0,ready;const started=new Promise(resolve=>ready=resolve);f.hooks.stream=async options=>{if(++n===2)ready();await new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));};const enhance=f.generate(f.a).catch(e=>e),suggest=f.runtime.dispatch({action:'generate',feature:'suggest',draft:'',draftRev:1,qaId:s.qaId},{agent:f.b}).catch(e=>e);await started;const other=f.streams.find(value=>value.sessionId==='b');await f.store.set('enhance',false);assert.equal(f.runtime.errorCode(await enhance),'cancelled');assert.equal(other.signal.aborted,false);f.runtime.dispose();assert.equal(f.runtime.errorCode(await suggest),'cancelled');});

test('global controls change cancels in-flight streams in all sessions and prevents stale publication',{timeout:2000},async t=>{
 const f=fixture(t);await f.store.set('enhance',true);let count=0,ready,release;
 const started=new Promise(done=>ready=done),gate=new Promise(done=>release=done);
 f.hooks.stream=async()=>{if(++count===2)ready();await gate;};
 const results=[f.generate(f.a).catch(error=>error),f.generate(f.b).catch(error=>error)];await started;
 try {await f.runtime.dispatch({action:'save-global',feature:'enhance',expectedRevision:0,config:normalizeConfig({rounds:2})});release();
  assert.ok((await Promise.all(results)).every(error=>f.runtime.errorCode(error)==='cancelled'));assert.equal(f.runtime.cache.size,0);
  assert.equal(f.runtime.state(f.a).settings.enhance.rounds,2);assert.equal(f.runtime.state(f.b).settings.enhance.rounds,2);
 } finally {release();}
});

test('reenabling before a slow cancellation settles never joins the retired request',{timeout:2000},async t=>{
 const f=fixture(t);await f.store.set('enhance',true);let oldReady,freshReady,oldRelease,freshRelease,count=0;
 const oldStarted=new Promise(r=>oldReady=r),freshStarted=new Promise(r=>freshReady=r),oldGate=new Promise(r=>oldRelease=r),freshGate=new Promise(r=>freshRelease=r);
 f.hooks.stream=async()=>{if(++count===1){oldReady();await oldGate;}else{freshReady();await freshGate;}};
 const old=f.generate().catch(e=>e);await oldStarted;const retired=f.runtime.jobs.get('a:enhance');
 await f.store.set('enhance',false);await f.store.set('enhance',true);const fresh=f.generate().catch(e=>e),replacement=f.runtime.jobs.get('a:enhance');
 try{assert.notStrictEqual(replacement,retired);await freshStarted;oldRelease();assert.equal(f.runtime.errorCode(await old),'cancelled');assert.strictEqual(f.runtime.jobs.get('a:enhance'),replacement);freshRelease();assert.equal((await fresh).text,'complete');assert.equal(f.streams.length,2);}finally{oldRelease();freshRelease();}
});
