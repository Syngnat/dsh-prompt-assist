import test from 'node:test';
import assert from 'node:assert/strict';
import {compactPanelModifier} from '../assist/client/result-layout.js';
import {css} from '../assist/client/style.js';
for(const feature of ['enhance','suggest'])test(feature+' applied state uses the same compact undo layout',()=>{assert.equal(compactPanelModifier({validUndo:true,feature}),' lpa-inline--undo');});
test('content and warning states are not squeezed into undo-sized strips',()=>{for(const patch of [{preview:{}},{referenceCount:1},{notice:'stale'}])assert.equal(compactPanelModifier({validUndo:true,...patch}),'');assert.equal(compactPanelModifier({pending:'enhance',validUndo:true}),' lpa-inline--pending');assert.equal(compactPanelModifier({validUndo:false}),'');});
test('undo is intrinsically sized and save buttons share form and feedback rows',()=>{assert.match(css,/\.lpa\.lpa-inline--undo\{width:fit-content/);assert.match(css,/lpa-undo-actions\{display:flex/);assert.match(css,/grid-row:span 4;grid-template-rows:subgrid/);assert.match(css,/margin-top:auto;align-self:flex-end/);});
