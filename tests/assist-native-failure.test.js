import test from 'node:test';
import assert from 'node:assert/strict';
import {providerFailureCode,isProviderFailureCode} from '../assist/provider-failure.js';
import {callAssistModel} from '../assist/model-call.js';
import {AssistRuntime} from '../assist/runtime.js';
import {initialContextState} from '../assist/context.js';
import {fixtureEnablement} from './assist-enablement-fixture.js';
import {errorKey,errorText} from '../assist/client/api.js';
import {dictionaries} from '../assist/client/messages.js';

const categories={AUTH:'provider-access-denied',RATE_LIMIT:'provider-rate-limited',INVALID_REQUEST:'provider-rejected',SERVER:'provider-unavailable',TIMEOUT:'provider-timeout',TRANSPORT:'provider-transport',STREAM_CLOSED:'provider-stream-incomplete',MALFORMED_RESPONSE:'provider-response-invalid',PI_AI_ERROR:'provider-response-error',QUOTA:'provider-quota',ACCOUNT_QUOTA:'provider-quota',CONTEXT_WINDOW_EXCEEDED:'context-overflow',EMPTY_RESPONSE:'empty-result'};
for(const [native,code] of Object.entries(categories))test(`native ${native} survives finish, Host and localized UI without prose`,async()=>{
 const reason={kind:'error',failure:{code:native,message:'PRIVATE request and credentials',requestId:'PRIVATE'}};
 const ctx={tokenMeter:{estimateMessage:()=>1},llm:{async prepareCall(config){return {config,context:{contextWindow:100000},async *stream(){yield {type:'finish',reason};}};}}};
 await assert.rejects(callAssistModel(ctx,{id:'native-failure'},{provider:'fixture',model:'fixture',fast:false},
  {system:'Edit.',user:'Anonymous requirement.'},'enhance',undefined,x=>x),error=>{
   assert.equal(error.code,code);assert.equal(AssistRuntime.prototype.errorCode.call({},error),code);
   assert.doesNotMatch(String(error)+JSON.stringify(error),/PRIVATE/);assert.equal(error.cause,undefined);return true;
  });
 assert.equal(AssistRuntime.prototype.errorCode.call({},{code:native,message:'PRIVATE'}),code);
 const key=errorKey({code});assert.notEqual(key,'requestError');assert.notEqual(key,'configError');
 for(const lang of ['zh','en']){assert.ok(dictionaries[lang][key]);assert.doesNotMatch(errorText({code,message:'PRIVATE'},k=>dictionaries[lang][k]),/PRIVATE/);}
});

test('unknown native codes do not become public diagnostics; semantic context/quota remain precise',()=>{
 for(const code of ['PRIVATE','__proto__','constructor','RATE_LIMIT PRIVATE'])assert.equal(providerFailureCode({code,message:'PRIVATE'}),'model-failed');
 assert.equal(providerFailureCode({code:'CONTEXT_WINDOW_EXCEEDED',status:400}),'context-overflow');
 assert.equal(providerFailureCode({code:'QUOTA',status:429}),'provider-quota');
 for(const code of ['provider-http-429 SECRET','provider-http-999','provider-http-200'])assert.equal(isProviderFailureCode(code),false);
});

for(const [native,expected] of [['TIMEOUT','provider-timeout'],['AUTH','provider-access-denied'],['unrecognized','model-failed']])test(`metadata-stage ${native} is sanitized without changing caller settings`,async t=>{
 const state=initialContextState({},0),agent={id:'metadata-error',session:{header:{}}};let attempts=0;
 const ctx={get:()=>undefined,sessionProjections:{stateOf:()=>state},llm:{async resolveModelInfo(){attempts++;throw Object.assign(new Error('PRIVATE response body'),{code:native});}}};
 const store=fixtureEnablement(),before=store.getSnapshot();
 const runtime=new AssistRuntime(ctx,{selection:()=>({provider:'fixture',model:'fixture'}),enabled:()=>false},[],x=>x,store);t.after(()=>runtime.dispose());
 await assert.rejects(runtime.generate(agent,{feature:'enhance',draft:'匿名需求',draftRev:1},{}),error=>{
  assert.equal(error.code,expected);assert.doesNotMatch(String(error)+JSON.stringify(error),/PRIVATE/);return true;
 });
 assert.equal(attempts,1);assert.strictEqual(store.getSnapshot(),before);assert.equal(runtime.jobs.size,0);assert.equal(runtime.cache.size,0);
});
