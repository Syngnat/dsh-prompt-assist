import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {css} from '../assist/client/style.js';
test('settings live in the main panel and open from the Plugins page, while only results anchor to the native composer overlay',()=>{
 const source=readFileSync(new URL('../assist/client/index.js',import.meta.url),'utf8');
 // The settings page stays a main panel, reached from the plugin's own page in
 // the Plugins page instead of a permanent sidebar row.
 assert.match(source,/name:'main',key:'local-prompt-assist'/);
 assert.match(source,/plugins\.detail\.actions/);
 assert.match(source,/conversation\.input\.overlay/);
 assert.doesNotMatch(source,/sidebar\.panellist/);
 assert.doesNotMatch(source,/conversation.input.dock|local-prompt-assist-controls/);assert.doesNotMatch(css,/position:fixed/);
 assert.equal((css.match(/position:absolute/g)??[]).length,1);assert.match(css,/\.lpa-result-anchor\{position:absolute/);assert.match(css,/lpa-settings-page/);
});
