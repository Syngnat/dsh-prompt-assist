import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {css} from '../assist/client/style.js';
test('settings stay in sidebar/main while only results anchor to the native composer overlay',()=>{
 const source=readFileSync(new URL('../assist/client/index.js',import.meta.url),'utf8');
 assert.match(source,/sidebar.panellist/);assert.match(source,/name:'main',key:'local-prompt-assist'/);assert.match(source,/conversation.input.overlay/);
 assert.doesNotMatch(source,/conversation.input.dock|local-prompt-assist-controls/);assert.doesNotMatch(css,/position:fixed/);
 assert.equal((css.match(/position:absolute/g)??[]).length,1);assert.match(css,/\.lpa-result-anchor\{position:absolute/);assert.match(css,/lpa-settings-page/);
});
