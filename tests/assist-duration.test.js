import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDuration} from '../assist/client/duration.js';
for(const [input,expected] of [[0,'0秒'],[999,'0秒'],[2669,'2秒'],[4141,'4秒'],[61001,'61秒'],[3600000,'3600秒'],[59999.6,'59秒']])test('elapsed '+input+' formats as '+expected,()=>assert.equal(formatDuration(input,'秒'),expected));
test('unknown or invalid durations do not turn into zero or NaN',()=>{for(const input of [null,undefined,NaN,Infinity,-1,'1000'])assert.equal(formatDuration(input,'秒'),'—');});
test('unit follows the active UI language',()=>assert.equal(formatDuration(2669,'s'),'2s'));
