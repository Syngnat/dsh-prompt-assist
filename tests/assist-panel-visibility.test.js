import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowPanel } from '../assist/client/panel-visibility.js';
const base={open:false,sessionId:'a',input:{draft:'hello',draftRev:4},result:{pending:null,preview:null,error:null},undo:null};
test('save then close removes the panel, including a late save acknowledgement',()=>{
 assert.equal(shouldShowPanel({...base,open:true,notice:'saved'}),true);
 assert.equal(shouldShowPanel({...base,notice:'saved'}),false);
 assert.equal(shouldShowPanel({...base,notice:'copied'}),false);
 assert.equal(shouldShowPanel({...base,result:{...base.result,error:'failed'}}),true);
});
test('real suggestion and pending generation still have a visible preview',()=>{
 assert.equal(shouldShowPanel({...base,result:{...base.result,preview:{sessionId:'a'}}}),true);
 assert.equal(shouldShowPanel({...base,result:{...base.result,pending:'suggest'}}),true);
 assert.equal(shouldShowPanel({...base,result:{...base.result,preview:{sessionId:'other'}}}),false);
});
test('stale undo does not leave an empty strip after editing or switching sessions',()=>{
 const undo={sessionId:'a',original:'hello',draftRev:4};
 assert.equal(shouldShowPanel({...base,undo}),true);
 assert.equal(shouldShowPanel({...base,undo:{...undo,draftRev:3}}),false);
 assert.equal(shouldShowPanel({...base,undo:{...undo,sessionId:'other'}}),false);
});
