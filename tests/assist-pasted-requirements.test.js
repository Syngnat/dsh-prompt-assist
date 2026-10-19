import test from 'node:test';
import assert from 'node:assert/strict';
import {COMPLETE_REQUIREMENTS} from './fixtures/requirements-paste.js';
import {buildAssistPrompt} from '../assist/prompts.js';
import {callAssistModel} from '../assist/model-call.js';
import {AssistRuntime} from '../assist/runtime.js';
import {installAssistStream,streamAssist} from '../assist/stream-transport.js';

// Scripted provider paths, not a reproduction of a real DeepSeek or GPT response.
function fixture({finish='stop',contextWindow=32768,nativeFailure}={}) {
 const calls=[],streams=[];let handler;
 const output=COMPLETE_REQUIREMENTS.replace('一、服务工单查询页面','# 服务工单查询页面');
 const ctx={tokenMeter:{estimateMessage:m=>m.content[0].text.length},llm:{async prepareCall(config){
  calls.push(config);
  return {config:{...config,maxTokens:8192},context:{contextWindow},async *stream(options){
   streams.push(options);
   if(finish==='stop')for(let i=0;i<output.length;i+=37)yield {type:'text-delta',text:output.slice(i,i+37)};
   yield {type:'finish',reason:{kind:finish,...(nativeFailure?{failure:nativeFailure}:{})}};
  }};
 }}};
 const service={
  dispatch(input,options){return callAssistModel(ctx,{id:'paste-fixture'},
   {provider:'scripted',model:'fixture-model',reasoningEffort:'high',fast:false},
   buildAssistPrompt('enhance',input.draft,[]),'enhance',options.signal,x=>({...x,role:'user'}),options.onText);},
  errorCode:error=>AssistRuntime.prototype.errorCode.call({},error),
 };
 installAssistStream({connection:{fetch:{register(value){handler=value.fetch;return()=>{};}}}},service);
 const fetcher=(_path,init)=>handler(new Request('http://fixture/assist',init));
 const run=onText=>streamAssist(fetcher,'paste-fixture',{feature:'enhance',draft:COMPLETE_REQUIREMENTS,draftRev:1},new AbortController().signal,onText);
 return {run,calls,streams,output};
}

test('complete anonymous requirements survive real prompt and NDJSON flow with empty QA',async()=>{
 assert.ok(COMPLETE_REQUIREMENTS.length>1000);
 const f=fixture(),seen=[];const result=await f.run(text=>seen.push(text));
 assert.equal(f.calls.length,1);assert.equal(f.streams.length,1);
 const data=JSON.parse(f.streams[0].messages[0].content[0].text);
 assert.equal(data.draft,COMPLETE_REQUIREMENTS);assert.deepEqual(data.qa,[]);
 assert.equal(result.text,f.output.trim());assert.ok(result.text.includes('组合查询的例外'));
 assert.ok(seen.length>0);assert.ok(seen.every(text=>f.output.startsWith(text)));
 assert.equal(result.outputBudgetTokens,8192);assert.equal(f.streams[0].reasoningEffort,'high');
 assert.equal(Object.hasOwn(f.calls[0],'maxTokens'),false,'plugin never invents a provider output cap');
});

test('the same complete document can receive an output-limit error without retry or partial success',async()=>{
 const f=fixture({finish:'max-tokens'}),seen=[];
 await assert.rejects(f.run(text=>seen.push(text)),{code:'output-limit'});
 assert.equal(f.calls.length,1);assert.equal(f.streams.length,1);assert.deepEqual(seen,[]);
 assert.equal(f.streams[0].maxTokens,8192);assert.equal(f.streams[0].reasoningEffort,'high');
});

test('provider rejection of a complete document survives Host and NDJSON without leaking provider prose',async()=>{
 const f=fixture({finish:'error',nativeFailure:{code:'INVALID_REQUEST',status:400,message:'PRIVATE request body and key'}});
 await assert.rejects(f.run(()=>{}),error=>{assert.equal(error.code,'provider-http-400');assert.doesNotMatch(String(error)+JSON.stringify(error),/PRIVATE/);return true;});
 assert.equal(f.calls.length,1);assert.equal(f.streams.length,1);
 assert.equal(JSON.parse(f.streams[0].messages[0].content[0].text).draft,COMPLETE_REQUIREMENTS);
});

test('insufficient captured context refuses the full prompt before streaming, without truncating the document',async()=>{
 const f=fixture({contextWindow:100});
 await assert.rejects(f.run(()=>{}),{code:'context-overflow'});
 assert.equal(f.calls.length,1);assert.equal(f.streams.length,0);
});
