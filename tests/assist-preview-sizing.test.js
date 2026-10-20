import test from 'node:test';
import assert from 'node:assert/strict';
import {css} from '../assist/client/style.js';
const rule=selector=>{const start=css.indexOf(selector+'{');assert.notEqual(start,-1,'Missing rule '+selector);return css.slice(start+selector.length+1,css.indexOf('}',start));};
test('dock card does not shrink below its content in native hero flex layout',()=>{assert.match(rule('.lpa-inline'),/flex:none/);assert.match(rule('.lpa-inline'),/display:flex/);assert.match(rule('.lpa-inline'),/flex-direction:column/);});
test('text absorbs height pressure while action row stays intact',()=>{assert.match(rule('.lpa-preview'),/min-height:0/);assert.match(rule('.lpa-preview>.lpa-result-text'),/flex:0 1 auto/);assert.match(rule('.lpa-preview-actions'),/flex-shrink:0/);});
test('expanded metadata has its own bounded scroll without a fixed popup',()=>{assert.match(rule('.lpa-preview-meta'),/max-height:min\(120px,14vh\)/);assert.match(rule('.lpa-preview-meta'),/overflow:auto/);assert.deepEqual([...css.matchAll(/([^{}]+)\{[^}]*position:fixed/g)].map(m=>m[1].trim()),['.lpa-model-menu']);assert.doesNotMatch(rule('.lpa-inline'),/position:/);});
