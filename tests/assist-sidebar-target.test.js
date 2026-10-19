import test from 'node:test';
import assert from 'node:assert/strict';
import {createSettingsTarget} from '../assist/client/settings-target.js';
import {suggestAvailability} from '../assist/client/enhance-action.js';
test('settings target changes only when an explicit composer session is visited',()=>{const store=createSettingsTarget();let calls=0;const off=store.subscribe(()=>calls++);assert.equal(store.getSnapshot().sessionId,null);store.select('a');const state=store.getSnapshot();store.select('a');assert.equal(store.getSnapshot(),state);store.select('b');assert.equal(store.getSnapshot().sessionId,'b');assert.equal(calls,2);off();});
test('manual suggestion is available at composer only with eligible empty draft and QA',()=>{const r={allowed:true,state:{qaCount:1},settings:{suggest:{enabled:true}},busy:false,dirty:false,input:{draft:'',draftRev:1,phase:'plain',occurrences:[],attachmentIds:[]},result:{pending:null}};assert.equal(suggestAvailability(r).ready,true);for(const patch of [{busy:true},{state:{qaCount:0}},{settings:{suggest:{enabled:false}}},{input:{...r.input,draft:'typing'}},{input:{...r.input,attachmentIds:['file']}}])assert.equal(suggestAvailability({...r,...patch}).ready,false);});

import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Settings} from '../assist/client/settings.js';
import {sessionSettings} from '../assist/client/api.js';
test('follow-session Fast may be saved without guessing runtime capability; fixed routes require known eligibility',()=>{
 const render=config=>renderToStaticMarkup(React.createElement(Settings,{config:sessionSettings(config),t:key=>key,catalog:{providers:[],models:[]},allowed:true}));
 assert.doesNotMatch(render({followSession:true,fast:false}),/<input[^>]*disabled/);
 assert.match(render({followSession:true,fast:false}),/settings.modelUnknown/);
 assert.match(render({followSession:false,fast:false}),/<input[^>]*disabled/);
 assert.doesNotMatch(render({followSession:false,fast:true}),/<input[^>]*disabled/);
});
