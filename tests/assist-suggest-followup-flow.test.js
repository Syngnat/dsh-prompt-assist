import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {AssistRuntime} from '../assist/runtime.js';
import {initialContextState} from '../assist/context.js';
import {normalizeConfig} from '../assist/config.js';
import {SUGGEST_ROLE_PROMPT as role} from '../assist/suggest-role.js';
import {createAssistController} from '../assist/client/controller.js';
import {fixtureEnablement} from './assist-enablement-fixture.js';

const cases=JSON.parse(readFileSync(new URL('./fixtures/suggest-perspective.json',import.meta.url),'utf8'));

// The test supplies every response. These offline protocol/context checks do not measure model intent quality.
function fixture(t,qa,{raw,finish='stop',error}){
 const agent={id:'a',session:{id:'a',header:{}}};
 const state=initialContextState({},0);
 state.settings={suggest:normalizeConfig({rounds:qa.length}),enhance:normalizeConfig()};
 state.rounds=qa.map((round,index)=>({...round,id:String(index*2+1)+':'+String(index*2+2),
  questionSeq:index*2+1,endSeq:index*2+2,truncated:false}));
 state.qaId=state.rounds.at(-1).id;state.qaCount=state.rounds.length;
 const prepares=[],streams=[],requests=[],pending=[],deltas=[];
 const ctx={
  agents:{get:id=>id===agent.id?agent:undefined,withInitiator:(_agent,run)=>run()},
  get:name=>name==='tokenMeter'?{estimateMessage:message=>Math.ceil(message.content[0].text.length/4)+8}:undefined,
  sessionProjections:{stateOf:()=>state},
  llm:{
   resolveModelInfo:async()=>({context:{contextWindow:1000000}}),
   prepareCall:async config=>{
    prepares.push({...config});
    return {config,context:{contextWindow:1000000},stream:async function*(options){
     streams.push(options);
     const split=Math.floor(raw.length/2);
     yield {type:'text-delta',text:raw.slice(0,split)};
     yield {type:'text-delta',text:raw.slice(split)};
     if(error)throw error;
     if(finish)yield {type:'finish',reason:{kind:finish}};
    }};
   },
  },
 };
 const runtime=new AssistRuntime(ctx,{selection:()=>({provider:'openai',model:'offline-fixture'}),enabled:()=>false},
  ['openai'],value=>({...value,role:'user'}),fixtureEnablement({suggest:true,enhance:false}));
 let latest,writes=0;
 const frame={sessionId:'a',qaId:state.qaId,busy:false,paused:false,routeKey:'offline-fixture',settings:runtime.settingsOf(agent),
  input:{draft:'',draftRev:1,occurrences:[],attachmentIds:[],phase:'plain'}};
 const controller=createAssistController({
  publish:value=>{latest=value;},requestId:()=>String(requests.length+1),
  actions:()=>({captureInsertion:()=>({start:0,end:0,draftRev:1}),replaceRange:()=>writes++}),
  send:(action,sessionId,payload,signal,onText)=>{
   requests.push({action,sessionId,payload});
   const work=runtime.dispatch({action,sessionId,...payload},{signal,onText:text=>{deltas.push(text);onText?.(text);}});
   pending.push(work);return work;
  },
 });
 t.after(()=>{controller.dispose();runtime.dispose();});
 const start=async()=>{
  controller.observe({...frame,qaId:null});
  controller.observe(frame);
  assert.equal(requests.length,1,'one automatic request for the new completed QA');
  await Promise.allSettled(pending);await nextTurn();
 };
 const observeAgain=async()=>{
  for(let index=0;index<3;index++)controller.observe(frame);
  await nextTurn();
 };
 return {runtime,controller,frame,prepares,streams,requests,deltas,start,observeAgain,
  get latest(){return latest;},get writes(){return writes;}};
}

function assertOneRequest(f,qa){
 assert.equal(f.requests.length,1);assert.equal(f.prepares.length,1);assert.equal(f.streams.length,1);
 assert.equal(f.streams[0].system,role);
 assert.deepEqual(JSON.parse(f.streams[0].messages[0].content[0].text),
  {feature:'suggest',draft:'',qa,files:[],references:[]});
 assert.equal(f.streams[0].messages[0].role,'user');
 assert.deepEqual(f.deltas,[],'suggestion JSON and partial text stay out of previews');
 assert.equal(f.writes,0,'a suggested follow-up never submits or applies itself');
 assert.equal(f.latest.pending,null);
}

for(const c of cases)test('offline scripted outcome retains complete QA without a second request: '+c.id,async t=>{
 // expectedKind is human annotation used to choose fixture bytes, never a model decision or runtime input.
 const envelope=c.expectedKind==='suggestion'?{kind:'suggestion',text:c.acceptableExamples[0]}:{kind:'none'};
 const f=fixture(t,c.qa,{raw:JSON.stringify(envelope)});
 await f.start();await f.observeAgain();
 assertOneRequest(f,c.qa);assert.equal(f.latest.error,null);
 if(envelope.kind==='suggestion'){
  assert.equal(f.latest.preview.outcome,'suggestion');assert.equal(f.latest.preview.text,envelope.text);
  assert.equal(f.latest.noSuggestion,null);
 }else{
  assert.equal(f.latest.noSuggestion.outcome,'no-suggestion');assert.equal(f.latest.noSuggestion.text,'');
  assert.equal(f.latest.preview,null);
 }
});

test('none for a human-labeled gap remains none without an automatic fallback call',async t=>{
 const c=cases.find(c=>c.id==='completed-claim-missing-evidence');
 assert.equal(c.expectedKind,'suggestion');
 const f=fixture(t,c.qa,{raw:'{"kind":"none"}'});
 await f.start();await f.observeAgain();assertOneRequest(f,c.qa);
 assert.equal(f.latest.noSuggestion.outcome,'no-suggestion');assert.equal(f.latest.preview,null);assert.equal(f.latest.error,null);
});

test('a protocol-valid but human-rejected suggestion is not rewritten by a runtime intent classifier',async t=>{
 const c=cases.find(c=>c.id==='reported-unconfirmed-validation');
 assert.ok(c.rejectedExamples.includes(c.reportedOutput));
 const f=fixture(t,c.qa,{raw:JSON.stringify({kind:'suggestion',text:c.reportedOutput})});
 await f.start();await f.observeAgain();assertOneRequest(f,c.qa);
 assert.equal(f.latest.preview.text,c.reportedOutput);assert.equal(f.latest.noSuggestion,null);assert.equal(f.latest.error,null);
});

for(const [name,response,code] of [
 ['invalid JSON',{raw:'暂无建议'},'invalid-suggestion'],
 ['extra none fields',{raw:'{"kind":"none","reason":"done"}'},'invalid-suggestion'],
 ['empty output',{raw:''},'empty-result'],
 ['unfinished none',{raw:'{"kind":"none"}',finish:null},'empty-result'],
 ['upstream failure after none',{raw:'{"kind":"none"}',finish:'error'},'model-failed'],
 ['output limit after none',{raw:'{"kind":"none"}',finish:'max-tokens'},'output-limit'],
 ['timeout after none',{raw:'{"kind":"none"}',error:new DOMException('deadline','TimeoutError')},'timeout'],
])test('offline '+name+' remains an error without automatic retry or none conversion',async t=>{
 const qa=cases.find(c=>c.id==='completed-claim-missing-evidence').qa;
 const f=fixture(t,qa,response);
 await f.start();await f.observeAgain();assertOneRequest(f,qa);
 assert.equal(f.runtime.errorCode(f.latest.error),code);
 assert.equal(f.latest.noSuggestion,null);assert.equal(f.latest.preview,null);assert.equal(f.runtime.cache.size,0);
});
