import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createAssistController} from '../assist/client/controller.js';
import {shouldShowPanel} from '../assist/client/panel-visibility.js';
import {NoSuggestion,Preview} from '../assist/client/preview.js';
import {dictionaries} from '../assist/client/messages.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 let frame={sessionId:'a',qaId:'1:2',busy:false,paused:false,routeKey:'route',settings:{suggest:{enabled:true,followSession:true},enhance:{enabled:true,followSession:true}},input:{draft:'',draftRev:1,occurrences:[],attachmentIds:[],phase:'plain'}};
 let latest;const requests=[];
 const controller=createAssistController({publish:value=>latest=value,actions:()=>({captureInsertion:()=>({start:0,end:frame.input.draft.length,draftRev:frame.input.draftRev})}),requestId:()=>String(requests.length),send:(_action,_session,payload,signal,onText)=>new Promise((resolve,reject)=>requests.push({payload,signal,onText,resolve,reject}))});
 const observe=patch=>{frame={...frame,...patch};controller.observe(frame);};
 const reply=(patch={},index=requests.length-1)=>{const r=requests[index];r.resolve({feature:r.payload.feature,original:r.payload.draft,draftRev:r.payload.draftRev,qaId:r.payload.qaId,outcome:'no-suggestion',text:'',...patch});};
 observe();return {controller,requests,observe,reply,get latest(){return latest;},get frame(){return frame;}};
}
async function none(){const f=fixture();f.observe({qaId:'3:4'});f.reply();await tick();return f;}
test('normal no-suggestion is successful, separate from preview/error, and never automatically retried',async()=>{
 const f=await none();assert.equal(f.latest.pending,null);assert.equal(f.latest.error,null);assert.equal(f.latest.preview,null);assert.equal(f.latest.noSuggestion.outcome,'no-suggestion');assert.equal(f.latest.noSuggestion.sessionId,'a');
 for(let i=0;i<4;i++)f.observe({});assert.equal(f.requests.length,1);
 f.controller.dismiss();assert.equal(f.latest.noSuggestion,null);f.observe({});assert.equal(f.requests.length,1);f.controller.dispose();
});
for(const [name,patch] of [['session',{sessionId:'b'}],['QA',{qaId:'5:6'}],['route',{routeKey:'other'}],['configuration',{settings:{suggest:{enabled:false},enhance:{enabled:true,followSession:true}}}],['editing configuration',{paused:true}],['busy',{busy:true}],['input',{input:{draft:'x',draftRev:2,occurrences:[],attachmentIds:[],phase:'plain'}}]]){
 test(`completed no-suggestion expires on ${name}`,async()=>{const f=await none();f.observe(patch);assert.equal(f.latest.noSuggestion,null);f.controller.dispose();});
 test(`late no-suggestion is ignored after ${name}`,async()=>{const f=fixture();f.observe({qaId:'3:4'});f.observe(patch);f.reply({},0);await tick();assert.equal(f.latest.noSuggestion,null);assert.equal(f.latest.error,null);f.controller.dispose();});
}
test('new request, configurationEdited, cancel and remount clear normal empty state',async()=>{
 for(const action of ['generate','configurationEdited','cancel','mount']){const f=await none();if(action==='generate'){const work=f.controller.generate('suggest');assert.equal(f.latest.noSuggestion,null);f.reply();assert.equal(await work,true);}else if(action==='mount'){f.controller.dispose();f.controller.mount();f.observe({});assert.equal(f.latest.noSuggestion,null);}else{f.controller[action]();assert.equal(f.latest.noSuggestion,null);}f.controller.dispose();}
});
test('cancel, stale receipt and request failure are not normal empty outcomes',async()=>{
 const cancelled=fixture();const work=cancelled.controller.generate('suggest');cancelled.controller.cancel();cancelled.reply();assert.equal(await work,false);assert.equal(cancelled.latest.error,null);assert.equal(cancelled.latest.noSuggestion,null);
 const stale=fixture();const old=stale.controller.generate('suggest');stale.reply({qaId:'9:10'});assert.equal(await old,false);assert.equal(stale.latest.error,'stale');assert.equal(stale.latest.noSuggestion,null);
 const failed=fixture();const fail=failed.controller.generate('suggest');const error=new Error('failed');failed.requests[0].reject(error);assert.equal(await fail,false);assert.equal(failed.latest.error,error);assert.equal(failed.latest.noSuggestion,null);
 for(const f of [cancelled,stale,failed])f.controller.dispose();
});
for(const patch of [{outcome:'no-suggestion',text:' '},{outcome:'no-suggestion',text:'next?'},{outcome:'no-suggestion',text:null},{outcome:'suggestion',text:''},{outcome:'suggestion',text:'  '},{outcome:'unknown',text:'next?'},{outcome:undefined,text:''},{outcome:undefined,text:'暂无建议。'},{outcome:'suggestion',text:'No suggestions available.'}]){
 test(`reject invalid receipt ${JSON.stringify(patch)}`,async()=>{const f=fixture();const work=f.controller.generate('suggest');f.reply(patch);assert.equal(await work,false);assert.equal(f.latest.error,'requestError');assert.equal(f.latest.preview,null);assert.equal(f.latest.noSuggestion,null);f.controller.dispose();});
}
test('enhance cannot claim normal no-suggestion',async()=>{const f=fixture();f.observe({input:{...f.frame.input,draft:'original'}});const work=f.controller.generate('enhance');f.reply();assert.equal(await work,false);assert.equal(f.latest.error,'requestError');assert.equal(f.latest.noSuggestion,null);f.controller.dispose();});
test('explicit and legacy nonempty suggestions still produce usable previews',async()=>{for(const outcome of ['suggestion',undefined]){const f=fixture();const work=f.controller.generate('suggest');f.reply({outcome,text:'What should I verify next?'});assert.equal(await work,true);assert.equal(f.latest.preview.text,'What should I verify next?');assert.equal(f.latest.noSuggestion,null);f.controller.dispose();}});
test('raw suggest stream never exposes JSON or placeholders and enhancement retains streaming',async()=>{
 const f=fixture();const work=f.controller.generate('suggest');for(const text of ['{"kind":','{"kind":"none"}','暂无建议','partial question']){f.requests[0].onText(text);assert.equal(f.latest.preview,null);assert.equal(f.latest.noSuggestion,null);assert.equal(f.latest.pending,'suggest');}f.reply();await work;f.controller.dispose();
 const g=fixture();g.observe({input:{...g.frame.input,draft:'original'}});const enhanced=g.controller.generate('enhance');g.requests[0].onText('partial');assert.equal(g.latest.preview.text,'partial');assert.equal(g.latest.preview.streaming,true);g.reply({outcome:undefined,text:'complete'});assert.equal(await enhanced,true);g.controller.dispose();
});
test('normal empty panel is session-owned, dismissible and SSR has no apply/copy/body',async()=>{
 const f=await none();const props={open:false,result:f.latest,undo:null,input:f.frame.input,sessionId:'a'};
 assert.equal(shouldShowPanel(props),true);assert.equal(shouldShowPanel({...props,sessionId:'b'}),false);
 const runtime={sessionId:'a',result:f.latest,controller:f.controller};
 const html=renderToStaticMarkup(React.createElement(React.Fragment,null,React.createElement(NoSuggestion,{runtime,t:key=>dictionaries.en[key]}),React.createElement(Preview,{runtime,t:key=>key})));
 assert.match(html,/role="status"/);assert.match(html,/No next-question suggestion/);assert.match(html,/>Dismiss<\/button>/);assert.doesNotMatch(html,/lpa-error|<pre|>Copy<|>Apply|>Accept/);
 assert.equal(renderToStaticMarkup(React.createElement(NoSuggestion,{runtime:{...runtime,sessionId:'b'},t:key=>key})), '');
 f.controller.dismiss();assert.equal(shouldShowPanel({...props,result:f.latest}),false);f.controller.dispose();
});

test('renderer defensively refuses non-adoptable suggestion receipts even outside the controller',()=>{
 for(const patch of [{outcome:'no-suggestion',text:''},{outcome:'suggestion',text:'暂无建议'},{outcome:'unknown',text:'next?'},{text:''}]){
  const runtime={sessionId:'a',result:{preview:{sessionId:'a',feature:'suggest',...patch}}};
  assert.equal(renderToStaticMarkup(React.createElement(Preview,{runtime,t:k=>k})), '');
 }
});
