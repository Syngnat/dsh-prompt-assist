import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AssistRuntime} from '../assist/runtime.js';
import {initialContextState} from '../assist/context.js';
import {normalizeConfig} from '../assist/config.js';
import {installAssistStream} from '../assist/stream-transport.js';
import {installAssistRpc,createAssistRpcApi} from '../assist/rpc-transport.js';
import {createAssistController} from '../assist/client/controller.js';
import {NoSuggestion,Preview} from '../assist/client/preview.js';
import {dictionaries} from '../assist/client/messages.js';
function fixture(t){
 const agent={id:'a',session:{id:'a',header:{}}},state=initialContextState({},0);
 state.settings={suggest:normalizeConfig({enabled:true}),enhance:normalizeConfig({enabled:true})};
 state.qaId='1:2';state.rounds=[{id:'1:2',question:'只分析，不执行。',answer:'分析已完成。',endSeq:2,truncated:false}];
 const provider={text:'{"kind":"none"}',finish:'stop',beforeFinish:null,calls:0};const handlers=new Map(),wires=[];
 const ctx={agents:{get:id=>id==='a'?agent:undefined,withInitiator:(_a,fn)=>fn()},get:()=>undefined,sessionProjections:{stateOf:()=>state},connection:{fetch:{register:r=>{handlers.set(r.path,r);return ()=>handlers.delete(r.path);}}},llm:{resolveModelInfo:async()=>({context:{contextWindow:1000000}}),prepareCall:async config=>({config,stream:async function*(){provider.calls++;for(const text of [provider.text.slice(0,7),provider.text.slice(7)])yield {type:'text-delta',text};await provider.beforeFinish?.();yield {type:'finish',reason:{kind:provider.finish}};}})}};
 const runtime=new AssistRuntime(ctx,{selection:()=>({provider:'openai',model:'fixture'}),enabled:()=>false},['openai'],x=>({...x,role:'user'}));
 installAssistStream(ctx,runtime);installAssistRpc(ctx,runtime);
 const request=async(url,init)=>{const path=new URL(url,'http://fixture/').pathname;const response=await handlers.get(path).fetch(new Request('http://fixture'+path,init));return response;};
 const api=createAssistRpcApi({rpc:{call:async(channel,method,payload,signal)=>{const response=await request(channel+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'r',method,payload}),signal});return (await response.json()).result;}}},async(url,init)=>{const response=await request(url,init);wires.push(response.clone().text());return response;});
 let latest,writes=0;const input={draft:'',draftRev:1,occurrences:[],attachmentIds:[],phase:'plain'};
 const controller=createAssistController({publish:s=>latest=s,send:api,actions:()=>({captureInsertion:()=>({start:0,end:0,draftRev:input.draftRev}),replaceRange:()=>writes++}),requestId:()=>String(provider.calls)});
 const frame={sessionId:'a',qaId:state.qaId,busy:false,paused:false,routeKey:'route',settings:state.settings,input};controller.observe(frame);
 t.after(()=>{controller.dispose();runtime.dispose();});
 return {runtime,api,provider,state,controller,frame,wires,get latest(){return latest;},get writes(){return writes;}};
}
test('model -> runtime/cache -> NDJSON -> controller -> non-adoptable UI is a normal success',async t=>{
 const f=fixture(t);assert.equal(await f.controller.generate('suggest'),true);
 assert.equal(f.latest.preview,null);assert.equal(f.latest.error,null);assert.equal(f.latest.noSuggestion.outcome,'no-suggestion');assert.equal(f.writes,0);
 const frames=(await f.wires[0]).trim().split('\n').map(JSON.parse);assert.deepEqual(frames.map(x=>x.type),['result']);assert.equal(frames[0].value.text,'');
 const r={sessionId:'a',result:f.latest,controller:f.controller};
 const html=renderToStaticMarkup(React.createElement(React.Fragment,null,React.createElement(NoSuggestion,{runtime:r,t:k=>dictionaries.zh[k]}),React.createElement(Preview,{runtime:r,t:k=>k})));
 assert.match(html,/role="status"/);assert.doesNotMatch(html,/<pre|lpa-error|应用|采用|复制/);
 assert.equal(await f.controller.generate('suggest'),true);assert.equal(f.provider.calls,1);assert.equal(f.latest.noSuggestion.cached,true);
 for(let i=0;i<4;i++)f.controller.observe(f.frame);assert.equal(f.provider.calls,1);
});
test('shared RPC and stream paths return the same normal empty outcome',async t=>{
 const f=fixture(t);const value=await f.api('generate','a',{feature:'suggest',draft:'',draftRev:1,qaId:'1:2'},new AbortController().signal);
 assert.equal(value.outcome,'no-suggestion');assert.equal(value.text,'');assert.equal(await f.controller.generate('suggest'),true);assert.equal(f.provider.calls,1);
});
for(const [name,text,finish,code] of [['invalid JSON','暂无建议','stop','invalid-suggestion'],['upstream error','{"kind":"none"}','error','model-failed'],['truncated','{"kind":"none"}','max-tokens','output-limit'],['empty','','stop','empty-result']])test(name+' remains an error through transport and UI',async t=>{
 const f=fixture(t);Object.assign(f.provider,{text,finish});assert.equal(await f.controller.generate('suggest'),false);
 assert.equal(f.latest.noSuggestion,null);assert.equal(f.latest.preview,null);assert.equal(f.latest.error.code,code);assert.equal(f.runtime.cache.size,0);assert.equal(f.writes,0);
 const frames=(await f.wires[0]).trim().split('\n').map(JSON.parse);assert.deepEqual(frames.map(x=>x.type),['error']);
});
test('QA advancing before the none result is not cached or shown as success',async t=>{
 const f=fixture(t);f.provider.beforeFinish=()=>{f.state.qaId='3:4';};assert.equal(await f.controller.generate('suggest'),false);
 assert.equal(f.latest.noSuggestion,null);assert.equal(f.latest.error.code,'stale-context');assert.equal(f.runtime.cache.size,0);
});
test('none can be replaced by a valid suggestion after expiry, never applying automatically',async t=>{
 const f=fixture(t);await f.controller.generate('suggest');f.runtime.cache.get('a:suggest').expires=0;f.provider.text='{"kind":"suggestion","text":"请继续回答之前未回答的问题。"}';
 assert.equal(await f.controller.generate('suggest'),true);assert.equal(f.latest.noSuggestion,null);assert.equal(f.latest.preview.text,'请继续回答之前未回答的问题。');assert.equal(f.provider.calls,2);assert.equal(f.writes,0);
});

test('timeout after none-looking bytes remains failure through the full chain',async t=>{
 const f=fixture(t);f.provider.beforeFinish=()=>{throw new DOMException('deadline','TimeoutError');};
 assert.equal(await f.controller.generate('suggest'),false);assert.equal(f.latest.noSuggestion,null);assert.equal(f.latest.error.code,'timeout');assert.equal(f.runtime.cache.size,0);
});
test('failed retry clears an earlier normal empty status instead of disguising the failure',async t=>{
 const f=fixture(t);await f.controller.generate('suggest');f.runtime.cache.get('a:suggest').expires=0;f.provider.text='invalid';
 assert.equal(await f.controller.generate('suggest'),false);assert.equal(f.latest.noSuggestion,null);assert.equal(f.latest.preview,null);assert.equal(f.latest.error.code,'invalid-suggestion');assert.equal(f.provider.calls,2);assert.equal(f.writes,0);
});
