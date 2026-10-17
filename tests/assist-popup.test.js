import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {css} from '../assist/client/style.js';
test('settings use sidebar/main and results use flow dock, without popup or toolbar settings',()=>{
 const source=readFileSync(new URL('../assist/client/index.js',import.meta.url),'utf8');
 assert.match(source,/sidebar.panellist/);assert.match(source,/name:'main',key:'local-prompt-assist'/);assert.match(source,/conversation.input.dock/);
 assert.doesNotMatch(source,/conversation.input.overlay|local-prompt-assist-controls/);assert.doesNotMatch(css,/position:absolute|position:fixed/);assert.match(css,/lpa-inline/);assert.match(css,/lpa-settings-page/);
});
