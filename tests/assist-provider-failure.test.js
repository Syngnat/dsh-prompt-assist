import test from 'node:test';
import assert from 'node:assert/strict';
import {callAssistModel} from '../assist/model-call.js';
import {AssistRuntime} from '../assist/runtime.js';
import {errorKey,errorText} from '../assist/client/api.js';
import {dictionaries} from '../assist/client/messages.js';

function fixture(reason){
 let prepares=0,streams=0;
 const ctx={tokenMeter:{estimateMessage:()=>1},llm:{async prepareCall(config){prepares++;
  return {config:{...config,maxTokens:8192},context:{contextWindow:32768},async *stream(){streams++;yield {type:'finish',reason};}};
 }}};
 const run=()=>callAssistModel(ctx,{id:'failure-fixture'},{provider:'fixture',model:'fixture',fast:false},
  {system:'Edit only.',user:'A short fictional requirement.'},'enhance',undefined,x=>({...x,role:'user'}));
 return {run,get prepares(){return prepares;},get streams(){return streams;}};
}

for(const status of [400,401,403,404,408,413,422,429,500,502,503,504])test(`native finish failure HTTP ${status} is not flattened into an unexplained model failure`,async()=>{
 const f=fixture({kind:'error',failure:{code:'private-vendor-code',message:'PRIVATE-DRAFT PRIVATE-KEY',status,requestId:'PRIVATE-REQUEST',providerRetryAfterMs:3000}});
 let caught;try{await f.run();}catch(error){caught=error;}
 assert.equal(caught?.code,`provider-http-${status}`);
 assert.equal(AssistRuntime.prototype.errorCode.call({},caught),`provider-http-${status}`);
 assert.equal(caught.cause,undefined);assert.doesNotMatch(String(caught)+JSON.stringify(caught),/PRIVATE|private-vendor/);
 assert.equal(f.prepares,1);assert.equal(f.streams,1,'never retry a provider error automatically');
});

test('unknown or untyped upstream statuses remain generic without leaking prose',async()=>{
 for(const status of [undefined,'400',399,600,NaN,Infinity,{},null]){
  const f=fixture({kind:'error',failure:{message:'PRIVATE-DRAFT',code:'PRIVATE-KEY',status}});
  await assert.rejects(f.run(),error=>error.code==='model-failed'&&!JSON.stringify(error).includes('PRIVATE'));
 }
});

test('provider errors are distinct from caller cancellation and output truncation',async()=>{
 await assert.rejects(fixture({kind:'aborted',failure:{status:504}}).run(),{code:'cancelled'});
 await assert.rejects(fixture({kind:'max-tokens'}).run(),{code:'output-limit'});
 assert.equal(AssistRuntime.prototype.errorCode.call({},{name:'TimeoutError'}),'timeout');
 for(const code of ['provider-http-429 PRIVATE','provider-http-200','provider-http-600','provider-http-0400'])
  assert.equal(AssistRuntime.prototype.errorCode.call({},{code}),'model-failed');
});

for(const [status,key] of [[400,'providerRejected'],[401,'providerAccessDenied'],[403,'providerAccessDenied'],[408,'providerTimeout'],[413,'providerRequestTooLarge'],[429,'providerRateLimited'],[500,'providerUnavailable'],[504,'providerTimeout']])test(`HTTP ${status} has a safe localized explanation`,()=>{
 const error={code:`provider-http-${status}`,message:'PRIVATE-DRAFT'};
 assert.equal(errorKey(error),key);
 for(const lang of ['zh','en']){
  const text=errorText(error,k=>dictionaries[lang][k]);assert.ok(dictionaries[lang][key]);
  assert.ok(text.includes(`HTTP ${status}`));assert.doesNotMatch(text,/PRIVATE/);
 }
});
