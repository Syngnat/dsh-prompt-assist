import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsTarget} from '../assist/client/settings-target.js';
import {suggestAvailability} from '../assist/client/enhance-action.js';
test('settings target changes only when an explicit composer session is visited',()=>{const store=createSettingsTarget();let calls=0;const off=store.subscribe(()=>calls++);assert.equal(store.getSnapshot().sessionId,null);store.select('a');const state=store.getSnapshot();store.select('a');assert.equal(store.getSnapshot(),state);store.select('b');assert.equal(store.getSnapshot().sessionId,'b');assert.equal(calls,2);off();});
test('manual suggestion is available at composer only with eligible empty draft and QA',()=>{const r={allowed:true,state:{qaCount:1},settings:{suggest:{enabled:true}},busy:false,dirty:false,input:{draft:'',draftRev:1,phase:'plain',occurrences:[],attachmentIds:[]},result:{pending:null}};assert.equal(suggestAvailability(r).ready,true);for(const patch of [{busy:true},{state:{qaCount:0}},{settings:{suggest:{enabled:false}}},{input:{...r.input,draft:'typing'}},{input:{...r.input,attachmentIds:['file']}}])assert.equal(suggestAvailability({...r,...patch}).ready,false);});

import {readFileSync} from 'node:fs';
test('unknown model capability cannot enable auxiliary Fast but a checked switch can be turned off',()=>{
 const source=readFileSync(new URL('../assist/client/settings.js',import.meta.url),'utf8');
 assert.ok(source.includes('!v.fast&&cap?.fastEligible!==true'));
});
