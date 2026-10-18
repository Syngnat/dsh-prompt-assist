import test from 'node:test';
import assert from 'node:assert/strict';
import {callAssistModel} from '../assist/model-call.js';
const route={provider:'openai',model:'fixture',fast:false,metadata:{context:{contextWindow:1000000}}};
async function run(chunks,{feature='suggest',signal}={}){
 const deltas=[];const ctx={llm:{prepareCall:async config=>({config,stream:async function*(){yield* chunks;}})}};
 const result=await callAssistModel(ctx,{id:'fixture'},route,{system:'system',user:'{}'},feature,signal,x=>({...x,role:'user'}),x=>deltas.push(x));
 return {result,deltas};
}
const stop={type:'finish',reason:{kind:'stop'}};
const delta=text=>({type:'text-delta',text});
test('none is a normal, textless result, never a partial preview',async()=>{
 const {result,deltas}=await run([delta('{"kind":'),delta('"none"}'),stop]);
 assert.equal(result.outcome,'no-suggestion');assert.equal(result.text,'');assert.deepEqual(deltas,[]);
});
test('a grounded suggestion is unwrapped only after complete stop',async()=>{
 const {result,deltas}=await run([delta('{"kind":"suggestion","text":" 请继续比较A和B。 "}'),stop]);
 assert.equal(result.outcome,'suggestion');assert.equal(result.text,'请继续比较A和B。');assert.deepEqual(deltas,[]);
});
test('every none-envelope chunk boundary remains invisible',async()=>{
 const raw=' {"kind":"none"} ';
 for(let i=0;i<=raw.length;i++){const value=await run([delta(raw.slice(0,i)),delta(raw.slice(i)),stop]);assert.equal(value.result.outcome,'no-suggestion');assert.deepEqual(value.deltas,[]);}
});
for(const raw of ['not JSON','暂无建议','null','[]','{}','{"kind":"other"}','{"kind":"none","text":"x"}','{"kind":"none","reason":"guess"}','{"kind":"suggestion","text":" "}','{"kind":"suggestion","text":4}','{"kind":"suggestion","text":"x","extra":true}','{"kind":"suggestion","text":"暂无建议。"}','{"kind":"suggestion","text":"No suggestions available."}'])test('invalid envelope is failure, not none: '+raw,async()=>{
 await assert.rejects(run([delta(raw),stop]),{code:'invalid-suggestion'});
});
test('empty and unfinished output are failures, not none',async()=>{
 for(const chunks of [[],[stop],[delta(' '),stop],[delta('{"kind":"none"}')]])await assert.rejects(run(chunks),{code:'empty-result'});
});
for(const [kind,code] of [['error','model-failed'],['max-tokens','output-limit'],['aborted','cancelled']])test('terminal '+kind+' overrides a complete none envelope',async()=>{
 await assert.rejects(run([delta('{"kind":"none"}'),{type:'finish',reason:{kind}}]),{code});
});
test('cancellation cannot become a no-suggestion success',async()=>{
 const abort=new AbortController();abort.abort();await assert.rejects(run([delta('{"kind":"none"}'),stop],{signal:abort.signal}),{name:'AbortError'});
});
test('enhancement retains plain text and streaming, including literal protocol-looking text',async()=>{
 for(const text of ['正常增强文本','{"kind":"none"}','暂无建议']){const value=await run([delta(text),stop],{feature:'enhance'});assert.equal(value.result.text,text);assert.equal(value.result.outcome,undefined);assert.deepEqual(value.deltas,[text]);}
});
