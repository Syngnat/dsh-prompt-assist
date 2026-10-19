import test from 'node:test';
import assert from 'node:assert/strict';
import { AssistRuntime } from '../assist/runtime.js';
import { initialContextState } from '../assist/context.js';
import { fixtureEnablement } from './assist-enablement-fixture.js';
import { normalizeConfig } from '../assist/config.js';

function fixture(t,store=fixtureEnablement()) {
 const states=new Map(),agents=new Map(),calls=[];
 for(const id of ['a','b']) {agents.set(id,{id,session:{id,header:{}}});states.set(id,initialContextState({},0));}
 const ctx={agents:{get:id=>agents.get(id),withInitiator:(_a,fn)=>fn()},get:()=>undefined,sessionProjections:{stateOf:s=>states.get(s.id)},
  llm:{listProviders:()=>[{id:'openai'},{id:'other'}],listModels:async()=>[{id:'native',name:'Native'}],resolveModelInfo:async(provider,model)=>{calls.push({provider,model});return {reasoning:{efforts:[{id:'high'}]}};},prepareCall:()=>{throw Error('must not request a model');}}};
 const fast={selection:agent=>({provider:'openai',model:agent.id,reasoningEffort:'high'}),enabled:()=>false};
 const runtime=new AssistRuntime(ctx,fast,['openai'],()=>{},store);t.after(()=>runtime.dispose());
 return {runtime,store,states,agents,calls};
}

test('global save requires no session, affects every session, and ignores legacy session controls',async t=>{
 const f=fixture(t);f.states.get('a').settings.enhance=normalizeConfig({rounds:19,provider:'old',model:'old'});
 assert.equal(f.runtime.settingsOf(f.agents.get('a')).enhance.rounds,1);
 const first=f.runtime.settingsOf(f.agents.get('a')).enhance;
 assert.strictEqual(first,f.runtime.settingsOf(f.agents.get('b')).enhance);
 const value=await f.runtime.dispatch({action:'save-global',feature:'enhance',config:normalizeConfig({rounds:5,enabled:false}),expectedRevision:0});
 assert.equal(value.settingsRevision,1);assert.equal(value.enabled.enhance,true);assert.equal(value.configured.enhance,true);
 for(const agent of f.agents.values())assert.equal(f.runtime.settingsOf(agent).enhance.rounds,5);
 assert.equal(f.calls.length,0);
 await assert.rejects(f.runtime.dispatch({action:'save',feature:'enhance'}),{code:'global-config-required'});
});

test('global metadata reads and follow-session saves need no resolved conversation',async t=>{
 const f=fixture(t);
 assert.equal((await f.runtime.dispatch({action:'catalog'})).providers.length,2);
 assert.equal((await f.runtime.dispatch({action:'catalog',provider:'openai'})).models[0].id,'native');
 assert.deepEqual((await f.runtime.dispatch({action:'model',provider:'openai',model:'native'})).efforts,[{id:'high'}]);
 const before=f.calls.length;
 await f.runtime.dispatch({action:'save-global',feature:'suggest',config:normalizeConfig({fast:true,rounds:3}),expectedRevision:0});
 assert.equal(f.calls.length,before);
});

test('explicit global routes validate native metadata and Fast even while disabled, with no model calls',async t=>{
 const f=fixture(t,fixtureEnablement({enhance:false,suggest:false}));
 const save=(config,expectedRevision=0)=>f.runtime.dispatch({action:'save-global',feature:'enhance',config:normalizeConfig(config),expectedRevision});
 await assert.rejects(save({followSession:false}),{code:'model-required'});
 await assert.rejects(save({followSession:false,provider:'missing',model:'m'}),{code:'not-configured'});
 await assert.rejects(save({followSession:false,provider:'openai',model:'m',reasoningEffort:'wrong'}),{code:'unsupported-effort'});
 await assert.rejects(save({followSession:false,provider:'other',model:'m',fast:true}),{code:'fast-unsupported'});
 const saved=await save({followSession:false,provider:'openai',model:'gpt-test',reasoningEffort:'high',fast:true,enabled:true});
 assert.equal(saved.enabled.enhance,false);assert.equal(saved.settings.enhance.fast,true);
 await assert.rejects(save({rounds:3},0),{code:'stale-global-settings'});
 const input={action:'save-global',feature:'enhance',config:normalizeConfig()};
 await assert.rejects(f.runtime.dispatch(input),{code:'invalid-request'});
 await assert.rejects(f.runtime.dispatch({...input,expectedRevision:1},{agent:{session:{header:{origin:'subagent'}}}}),{code:'forbidden'});
 assert.equal(f.runtime.errorCode({code:'stale-global-settings'}),'stale-global-settings');assert.equal(f.runtime.errorCode({code:'global-config-required'}),'global-config-required');
});

test('old enabled flags without confirmed controls fail closed and never fall back to sessions',async t=>{
 const base=fixtureEnablement(),snapshot=base.getSnapshot(),unconfigured={...snapshot,configured:{suggest:false,enhance:false}};
 const f=fixture(t,{getSnapshot:()=>unconfigured,subscribe:()=>()=>{}});const agent=f.agents.get('a');
 f.states.get('a').settings.enhance=normalizeConfig({enabled:true,rounds:20});
 assert.equal(f.runtime.settingsOf(agent).enhance.enabled,false);assert.equal(f.runtime.settingsOf(agent).enhance.rounds,1);
 await assert.rejects(f.runtime.dispatch({action:'generate',feature:'enhance',draft:'draft',draftRev:1},{agent}),{code:'global-config-required'});
 const missing=fixture(t,null),missingAgent=missing.agents.get('a');
 assert.equal(missing.runtime.settingsOf(missingAgent).enhance.enabled,false);
 await assert.rejects(missing.runtime.dispatch({action:'generate',feature:'enhance'},{agent:missingAgent}),{code:'global-settings-unavailable'});
 const flagsOnly=fixture(t,{getSnapshot:()=>({scope:'profile',revision:1,enabled:{suggest:true,enhance:true}}),subscribe:()=>()=>{}});
 assert.equal(flagsOnly.runtime.settingsOf(flagsOnly.agents.get('a')).enhance.enabled,false);
 await assert.rejects(flagsOnly.runtime.dispatch({action:'generate',feature:'enhance'},{agent:flagsOnly.agents.get('a')}),{code:'global-settings-unavailable'});
});

test('profile controls abort related jobs and clear caches across all sessions but preserve other feature',async t=>{
 const f=fixture(t),controllers=[];
 for(const id of ['a','b'])for(const feature of ['suggest','enhance']) {const controller=new AbortController();controllers.push({id,feature,controller});f.runtime.jobs.set(`${id}:${feature}`,{controller});f.runtime.cache.set(`${id}:${feature}`,{});}
 const other=f.runtime.settingsOf(f.agents.get('a')).suggest;
 await f.runtime.dispatch({action:'save-global',feature:'enhance',config:normalizeConfig({rounds:9}),expectedRevision:0});
 for(const {id,feature,controller} of controllers) {assert.equal(controller.signal.aborted,feature==='enhance');assert.equal(f.runtime.cache.has(`${id}:${feature}`),feature==='suggest');}
 assert.strictEqual(other,f.runtime.settingsOf(f.agents.get('a')).suggest);
});
