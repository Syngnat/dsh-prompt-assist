import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Settings} from '../assist/client/settings.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {errorKey,DEFAULT_SETTINGS} from '../assist/client/api.js';
import {dictionaries} from '../assist/client/messages.js';
import {callAssistModel} from '../assist/model-call.js';
function fixture(defaultMaxTokens,contextWindow=1000000,sample='Complete enhancement.'){
 const calls=[],streams=[],measured=[];const metadata={context:{contextWindow},...(defaultMaxTokens===undefined?{}:{defaultMaxTokens})};
 const ctx={tokenMeter:{estimateMessage(message){measured.push(message);return Math.ceil(message.content[0].text.length/4)+8;}},llm:{async prepareCall(config,signal,configure){
  const {provider,model,...proposed}=config;
  const controls=configure?configure(Object.freeze(proposed),Object.freeze(metadata)):proposed;
  const resolved={provider,model,...controls,...(controls.maxTokens===undefined&&metadata.defaultMaxTokens!==undefined?{maxTokens:metadata.defaultMaxTokens}:{})};
  calls.push(resolved);
  return {config:resolved,context:metadata.context,async *stream(options){streams.push(options);
   if(options.maxTokens!==undefined&&options.maxTokens<8192){yield {type:'finish',reason:{kind:'max-tokens'}};return;}
   const feature=JSON.parse(options.messages[0].content[0].text).feature;
   yield {type:'text-delta',text:feature==='suggest'?JSON.stringify({kind:'suggestion',text:sample}):sample};
   yield {type:'finish',reason:{kind:'stop'}};
  }};
 }}};
 const run=(feature,previousMetadata=metadata,draft='draft')=>callAssistModel(ctx,{id:'budget-fixture'},{provider:'fixture',model:'reasoning',metadata:previousMetadata,reasoningEffort:'high',fast:false},{system:'system',user:JSON.stringify({feature,draft})},feature,undefined,x=>({...x,role:'user'}));
 return {run,calls,streams,metadata,measured,ctx};
}
for(const feature of ['suggest','enhance'])test(feature+' uses native configured output budget',async()=>{const f=fixture(16384);const result=await f.run(feature);assert.ok(result.text);assert.equal(f.calls[0].maxTokens,16384);assert.equal(result.outputBudgetTokens,16384);});
test('lower configured cap is not raised and provider truncation remains an error',async()=>{const f=fixture(512);await assert.rejects(f.run('enhance'),{code:'output-limit'});assert.equal(f.calls[0].maxTokens,512);});
test('no configured output budget leaves maxTokens omitted for native/provider defaults',async()=>{for(const feature of ['suggest','enhance']){const f=fixture();const value=await f.run(feature);assert.ok(value.text);assert.equal(Object.hasOwn(f.calls[0],'maxTokens'),false);assert.equal(value.outputBudgetTokens,null);}});
test('captured defaults win over stale lookup without changing reasoning',async()=>{const f=fixture(16384);const value=await f.run('enhance',{context:{contextWindow:1000000},defaultMaxTokens:512});assert.equal(f.calls[0].maxTokens,16384);assert.equal(f.calls[0].reasoningEffort,'high');assert.equal(value.outputBudgetTokens,16384);});
test('context overflow refuses dispatch rather than silently lowering configured output',async()=>{const f=fixture(16384,20);await assert.rejects(f.run('enhance'),{code:'context-overflow'});assert.equal(f.calls[0].maxTokens,16384);assert.equal(f.streams.length,0);});
test('invalid budget, missing meter and unknown/exhausted window fail before dispatch',async()=>{for(const value of [0,-1,Infinity,NaN,1.5,'16384']){const f=fixture(value);await assert.rejects(f.run('enhance'),{code:'invalid-config'});assert.equal(f.streams.length,0);}for(const window of [0,NaN]){const f=fixture(16384,window);await assert.rejects(f.run('enhance'),{code:'context-unknown'});assert.equal(f.streams.length,0);}const f=fixture();delete f.ctx.tokenMeter;await assert.rejects(f.run('enhance'),{code:'context-unknown'});});
test('long Unicode input uses Host token estimates, not UTF8 bytes or a fixed input length',async()=>{const f=fixture(16384,100000),draft='汉'.repeat(100000);const value=await f.run('enhance',f.metadata,draft);assert.ok(Buffer.byteLength(draft)>262144);assert.ok(value.inputTokensEstimate<30000);assert.equal(JSON.parse(f.streams[0].messages[0].content[0].text).draft,draft);assert.deepEqual(f.measured.map(x=>x.role),['system','user']);});
test('large complete output is preserved for both features, without a 64K text cap',async()=>{const text='文'.repeat(100000);for(const feature of ['suggest','enhance']){const f=fixture(131072,1000000,text);assert.equal((await f.run(feature)).text,text);}});
test('timeout and model token limits have distinct localized notices',()=>{for(const [code,key]of [['timeout','requestTimeout'],['output-limit','outputLimit'],['context-unknown','contextUnknown']]){assert.equal(errorKey({code}),key);for(const lang of ['zh','en'])assert.ok(dictionaries[lang][key]);}});
test('settings disclose provider-model limits, time and cost in both languages',()=>{for(const lang of ['zh','en']){const html=renderToStaticMarkup(React.createElement(Settings,{t:key=>dictionaries[lang][key],config:DEFAULT_SETTINGS,catalog:{providers:[],models:[]},allowed:true,onChange(){},save(){}}));assert.ok(html.includes(dictionaries[lang].budgetPolicy));assert.ok(!dictionaries[lang].budgetPolicy.includes('1024/4096'));}});

test('model output setting is not reduced merely to reserve its worst-case maximum',async()=>{const f=fixture(16384,10000);await f.run('enhance');assert.equal(f.calls[0].maxTokens,16384);});
test('a stale lookup window cannot replace an undisclosed captured model window',async()=>{const f=fixture(16384);f.metadata.context=undefined;await assert.rejects(f.run('enhance',{context:{contextWindow:1000000}}),{code:'context-unknown'});assert.equal(f.streams.length,0);});
