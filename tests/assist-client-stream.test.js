import test from 'node:test';
import assert from 'node:assert/strict';
import {createAssistController} from '../assist/client/controller.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){let latest,onText,payload;const done=deferred();const input={draft:'Original',draftRev:1,phase:'plain',attachmentIds:[],occurrences:[]};const base={sessionId:'a',input,qaId:'1:4',busy:false,paused:false,routeKey:'route',settings:{enhance:{enabled:true,followSession:true},suggest:{enabled:false}}};
 const c=createAssistController({publish:s=>latest=s,actions:()=>({captureInsertion:()=>({start:0,end:8,draftRev:input.draftRev})}),requestId:()=> 'id',send:(_a,_s,p,_signal,progress)=>{onText=progress;payload=p;return done.promise;}});c.observe(base);
 return {c,base,done,get latest(){return latest;},text:t=>onText(t),finish(){done.resolve({...payload,original:payload.draft,text:'Complete'});}};
}
test('controller publishes incremental preview before final result and unlocks only completed output',async()=>{
 const f=fixture();const work=f.c.generate('enhance');f.text('Part');assert.equal(f.latest.preview.text,'Part');assert.equal(f.latest.preview.streaming,true);assert.equal(f.latest.pending,'enhance');f.finish();await work;assert.equal(f.latest.preview.text,'Complete');assert.equal(Boolean(f.latest.preview.streaming),false);assert.equal(f.latest.pending,null);
});
test('cancel removes partial preview and ignores late chunks',async()=>{
 const f=fixture();const work=f.c.generate('enhance');f.text('Part');f.c.cancel();assert.equal(f.latest.preview,null);f.text('Late');assert.equal(f.latest.preview,null);f.finish();await work;assert.equal(f.latest.preview,null);
});
test('failed stream removes partial output instead of enabling apply',async()=>{
 const f=fixture();const work=f.c.generate('enhance');f.text('Part');f.done.reject(Object.assign(new Error('model-failed'),{code:'model-failed'}));await work;assert.equal(f.latest.preview,null);assert.equal(f.latest.error.code,'model-failed');
});
test('editing invalidates partial preview and future chunks',async()=>{
 const f=fixture();const work=f.c.generate('enhance');f.text('Part');f.c.observe({...f.base,input:{...f.base.input,draft:'Edited',draftRev:2}});f.text('Late');assert.equal(f.latest.preview,null);f.finish();await work;assert.equal(f.latest.preview,null);
});

test('enhancement starts while main is busy and survives its QA completion',async()=>{
 const f=fixture();f.c.observe({...f.base,busy:true});const work=f.c.generate('enhance');f.text('Part');assert.equal(f.latest.preview.text,'Part');
 f.c.observe({...f.base,busy:false,qaId:'5:9'});f.text('More');assert.equal(f.latest.preview.text,'More');f.finish();assert.equal(await work,true);assert.equal(f.latest.preview.text,'Complete');
 f.c.observe({...f.base,busy:true,qaId:'5:9'});assert.equal(f.latest.preview.text,'Complete');
});
