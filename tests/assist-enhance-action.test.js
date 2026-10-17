import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnhanceAction, enhanceAvailability } from '../assist/client/enhance-action.js';
const ready={ready:true,pending:false,reason:'generate'};
test('toolbar invokes existing enhancement without opening settings or submitting',async()=>{
 const action=createEnhanceAction();let calls=0;action.update(ready,async()=>{calls++;return true;});
 assert.equal(await action.run(),true);assert.equal(calls,1);assert.equal(action.getSnapshot().pending,false);
});
test('double click coalesces while generation is pending',async()=>{
 const action=createEnhanceAction();let finish;let calls=0;action.update(ready,()=>{calls++;return new Promise(r=>finish=r);});
 const running=action.run();assert.equal(action.getSnapshot().pending,true);assert.equal(await action.run(),false);finish(true);await running;assert.equal(calls,1);
});
test('unmount and session isolation cannot invoke another session handler',async()=>{
 const a=createEnhanceAction(),b=createEnhanceAction();let calls=0;a.update(ready,async()=>{calls++;});
 assert.equal(await b.run(),false);a.clear();assert.equal(await a.run(),false);assert.equal(calls,0);
});
test('empty draft, disabled, dirty and submitting block the toolbar with a reason',()=>{
 const r={allowed:true,state:{},settings:{enhance:{enabled:true}},dirty:false,busy:false,input:{draft:'Original',phase:'plain'},result:{pending:null}};
 assert.equal(enhanceAvailability(r).ready,true);
 for(const patch of [{allowed:false},{state:null},{settings:{enhance:{enabled:false}}},{dirty:true},{input:{draft:' ',phase:'plain'}},{input:{draft:'Original',phase:'submitting'}},{result:{pending:'enhance'}}])assert.equal(enhanceAvailability({...r,...patch}).ready,false);
});
