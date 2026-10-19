import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {css} from '../assist/client/style.js';
const require=createRequire(new URL('../package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {buildSync}=require('esbuild');
const built=buildSync({entryPoints:[fileURLToPath(new URL('../assist/client/preview.js',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react']});
const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);
const {Preview}=module.exports;
function render(feature,streaming=false,busy=false){return renderToStaticMarkup(React.createElement(Preview,{runtime:{sessionId:'a',allowed:true,busy,dirty:false,result:{preview:{sessionId:'a',feature,streaming,snapshot:{structured:false},original:'Original text',text:'Result text',route:{provider:'openai',model:'gpt-test'},timing:{ttftMs:12,totalMs:30}}}},actions:{},t:key=>key,onApplied(){}}));}
test('inline width follows composer and pending status is intrinsic, never screen-wide',()=>{assert.match(css,/max-width:var\(--dsh-composer-card-max-width,840px\)/);assert.match(css,/lpa-inline--pending\{width:fit-content/);assert.match(css,/margin:0 auto 8px/);assert.doesNotMatch(css,/position:fixed/);assert.match(css,/\.lpa-result-anchor>\.lpa-inline\{width:100%;max-width:none;margin:0/);});
test('enhancement renders result first with original and diagnostics collapsed by default',()=>{const html=render('enhance');assert.ok(html.indexOf('Result text')<html.indexOf('Original text'));assert.equal((html.match(/<details>/g)||[]).length,2);assert.doesNotMatch(html,/<details[^>]* open/);assert.doesNotMatch(html,/lpa-grid/);assert.match(html,/showOriginal/);assert.match(html,/generationDetails/);});
test('suggestion avoids unnecessary original comparison',()=>{const html=render('suggest');assert.doesNotMatch(html,/Original text|showOriginal/);assert.match(html,/Result text/);assert.match(html,/accept/);});
test('streaming shows compact status and keeps apply and copy disabled',()=>{const html=render('enhance',true);assert.match(html,/streamingShort/);assert.match(html,/<button[^>]*disabled[^>]*>apply<\/button>/);assert.match(html,/<button[^>]*disabled[^>]*>copy<\/button>/);assert.match(html,/>cancel<\/button>/);});

test('completed enhancement remains applicable while main runs, suggestion does not',()=>{
 assert.match(render('enhance',false,true),/<button(?![^>]*disabled)[^>]*>apply<\/button>/);
 assert.match(render('suggest',false,true),/<button[^>]*disabled[^>]*>accept<\/button>/);
});
