import test from 'node:test';
import assert from 'node:assert/strict';
import {installAssistStream,streamAssist,STREAM_PATH} from '../assist/stream-transport.js';
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(service){let route;installAssistStream({connection:{fetch:{register(r){route=r;return()=>{};}}}},service);return (path,init)=>{assert.equal(path,STREAM_PATH.slice(1));return route.fetch(new Request('http://dsh.internal/'+path,init));};}
test('incremental text arrives before generation completes, over real ReadableStream framing',async()=>{
 const gate=defer(),first=defer();let complete=false;
 const fetcher=setup({async dispatch(input,{onText}){onText('正在');await gate.promise;onText('正在优化');complete=true;return {text:'正在优化'};},errorCode:()=> 'model-failed'});
 const parts=[];const request=streamAssist(fetcher,'a',{feature:'enhance'},undefined,text=>{parts.push(text);first.resolve();});
 await first.promise;assert.equal(complete,false);assert.equal(parts[0],'正在');gate.resolve();assert.deepEqual(await request,{text:'正在优化'});
});
test('failure after partial output rejects rather than treating the partial as a completed result',async()=>{
 const fetcher=setup({async dispatch(_,{onText}){onText('partial');throw Error('SECRET');},errorCode:()=> 'model-failed'});
 await assert.rejects(streamAssist(fetcher,'a',{},undefined,()=>{}),e=>e.code==='model-failed'&&!e.message.includes('SECRET'));
});
test('truncated stream with no result frame is rejected',async()=>{
 const fetcher=async()=>new Response(JSON.stringify({type:'text',text:'partial'})+'\n');
 await assert.rejects(streamAssist(fetcher,'a',{},undefined,()=>{}),{code:'transport-incomplete'});
});
test('reader cancellation aborts the owning generation',async()=>{
 let route;let aborted=false;const started=defer();
 installAssistStream({connection:{fetch:{register(r){route=r;}}}},{async dispatch(_,{signal,onText}){onText('first');started.resolve();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true}));},errorCode:()=> 'cancelled'});
 const response=await route.fetch(new Request('http://dsh.internal'+STREAM_PATH,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'generate'})}));
 await started.promise;await response.body.cancel();assert.equal(aborted,true);
});

import {callAssistModel} from '../assist/model-call.js';
test('provider text deltas reach callback while completion is still pending',async()=>{
 const gate=defer(),seen=defer();const updates=[];
 const ctx={llm:{async prepareCall(config){return {config,context:{contextWindow:100000},async *stream(){yield {type:'text-delta',text:'A'};await gate.promise;yield {type:'text-delta',text:'B'};yield {type:'finish',reason:{kind:'stop'}};}};}}};
 const pending=callAssistModel(ctx,{id:'a'},{provider:'openai',model:'gpt-test',metadata:{},fast:false},{system:'s',user:'u'},'enhance',undefined,value=>({...value,role:'user'}),text=>{updates.push(text);seen.resolve();});
 await seen.promise;assert.deepEqual(updates,['A']);gate.resolve();assert.equal((await pending).text,'AB');assert.deepEqual(updates,['A','AB']);
});
