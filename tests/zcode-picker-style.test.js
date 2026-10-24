import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readModelStylePref,writeModelStylePref,MODEL_STYLES} from '../assist/client/model-style-pref.js';
import {ZcodeEffortVisual,isGlmHighspeedModel,EFFORT_BUBBLES,highspeedBubbles} from '../assist/client/zcode-effort-visual.js';
import {zcodeEffortCss} from '../assist/client/zcode-effort-style.js';
import {pickerCss} from '../assist/client/model-picker-style.js';

test('style preference round-trips three values and defaults unknown ones to claude',()=>{
 const store=new Map();
 globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v)};
 try{
  assert.equal(readModelStylePref(),'claude');
  for(const value of MODEL_STYLES){writeModelStylePref(value);assert.equal(readModelStylePref(),value);}
  writeModelStylePref('nonsense');assert.equal(readModelStylePref(),'claude');
  assert.deepEqual(MODEL_STYLES,['dsh','claude','zcode']);
 }finally{delete globalThis.localStorage;}
});

test('GLM highspeed detection follows the ZCode display-name rule',()=>{
 assert.equal(isGlmHighspeedModel('GLM-5.3-Highspeed'),true);
 assert.equal(isGlmHighspeedModel('glm-4.7-flashx'),true);
 assert.equal(isGlmHighspeedModel('GLM-5.3-Flash'),false);
 assert.equal(isGlmHighspeedModel('cpa/glm-highspeed'),true);
 assert.equal(isGlmHighspeedModel('DeepSeek-V4.1-Highspeed'),false);
 assert.equal(isGlmHighspeedModel(''),false);
});

test('bubble seeds are ZCode verbatim and the highspeed variant is a sped-up repetition',()=>{
 assert.equal(EFFORT_BUBBLES.length,12);
 assert.deepEqual(EFFORT_BUBBLES[0],{top:4,size:2,duration:2.6,delay:-0.4});
 const fast=highspeedBubbles();
 assert.equal(fast.length,32);
 assert.deepEqual(fast[0],{...EFFORT_BUBBLES[0],duration:0.8,delay:-0});
 assert.deepEqual(fast[7],{...EFFORT_BUBBLES[7],duration:(8+(7%5))/10,delay:-7*0.137});
});

const rows=(n)=>Array.from({length:n},(_,i)=>({id:'row'+i,effort:i===0?undefined:'level'+i,label:'L'+i}));
const markup=(props)=>renderToStaticMarkup(React.createElement(ZcodeEffortVisual,{rows:rows(4),index:1,label:'High',t:key=>({'picker.effort':'Reasoning effort'})[key]||key,...props},null));

test('visual tree carries the ZCode slider structure and state attributes',()=>{
 const html=markup();
 assert.match(html,/class="lpa-effort lpa-zt"/);
 assert.match(html,/data-lpa-zt-style=""/);
 assert.match(html,/Reasoning effort/);
 assert.match(html,/class="lpa-zt-track"/);
 assert.match(html,/class="lpa-zt-fill"/);
 assert.match(html,/calc\(14px \+ \(100% - 28px\) \* 0\.333[0-9]*\)/);
 assert.match(html,/class="lpa-zt-thumb"/);
 assert.match(html,/calc\(\(100% - 28px\) \* 0\.333[0-9]*\)/);
 assert.match(html,/lpa-zt-stop" data-filled=""/);
 assert.match(html,/class="lpa-zt-stop"/);
 assert.doesNotMatch(html,/data-max=""/);
 assert.doesNotMatch(html,/class="lpa-zt-bubbles"/);
});

test('the strongest enabled level turns on the gradient and bubbles',()=>{
 const html=markup({index:3});
 assert.match(html,/data-max=""/);
 assert.match(html,/class="lpa-zt-bubbles"/);
 assert.equal((html.match(/class="lpa-zt-bubble"/g)||[]).length,12);
});

test('highspeed models switch the variant and bubble count',()=>{
 const html=markup({index:3,highspeed:true});
 assert.match(html,/data-highspeed=""/);
 assert.match(html,/data-max=""/);
 assert.equal((html.match(/class="lpa-zt-bubble"/g)||[]).length,32);
});

test('disabled and dragging states expose the right hooks',()=>{
 const disabled=markup({disabled:true});
 assert.match(disabled,/data-disabled=""/);
 assert.doesNotMatch(disabled,/data-max=""/);
 const dragging=markup({position:0.9,dragging:true});
 assert.match(dragging,/data-dragging=""/);
 assert.match(dragging,/calc\(14px \+ \(100% - 28px\) \* 0\.9\)/);
 assert.match(dragging,/data-hovered=""/);
});

test('the ported CSS keeps ZCode motion, theming and reduced-motion guarantees',()=>{
 assert.match(zcodeEffortCss,/lpa-zt-bubble-flow/);
 assert.match(zcodeEffortCss,/translateX\(104%\)/);
 assert.match(zcodeEffortCss,/linear-gradient\(270deg in oklch shorter hue/);
 assert.match(zcodeEffortCss,/linear-gradient\(90deg in oklab/);
 assert.match(zcodeEffortCss,/prefers-reduced-motion:reduce/);
 assert.match(zcodeEffortCss,/data-ds-dark-theme\] \.lpa-effort\.lpa-zt/);
 assert.match(zcodeEffortCss,/--dsw-alias-label-primary/);
 assert.match(zcodeEffortCss,/\.lpa-zt-bubble\{animation:none\}/);
});

test('zcode-style provenance ships with pinned sources and license', async()=>{
 const fs=await import('node:fs/promises');
 const readText=async p=>fs.readFile(new URL('../'+p,import.meta.url),'utf8');
 const license=await readText('third-party/zcode-style/LICENSE');
 assert.match(license,/Apache License/);
 assert.match(license,/Copyright 2026 Z\.AI Co\., Ltd/);
 const provenance=JSON.parse(await readText('third-party/zcode-style/PROVENANCE.json'));
 assert.equal(provenance.repository,'https://github.com/zai-org/ZCode');
 assert.match(provenance.commit,/^[a-f0-9]{40}$/);
 assert.equal(provenance.license,'Apache-2.0');
 assert.ok(provenance.sources.length>=5);
 for(const source of provenance.sources){assert.match(source.gitBlobSha1,/^[a-f0-9]{40}$/);assert.match(source.sha256,/^[a-f0-9]{64}$/);assert.ok(source.bytes>0);}
 assert.equal(provenance.licenseFile,'third-party/zcode-style/LICENSE');
 const slider=JSON.parse(await readText('third-party/zcode-style/SLIDER-PROVENANCE.json'));
 assert.equal(slider.slider.keptVerbatim.length,7);
 const pkg=JSON.parse(await readText('package.json'));
 for(const file of ['third-party/zcode-style/LICENSE','third-party/zcode-style/PROVENANCE.json','third-party/zcode-style/SLIDER-PROVENANCE.json'])assert.ok(pkg.files.includes(file),file);
});

test('menu surface follows the DSH theme token and never scrolls horizontally',()=>{
 assert.match(pickerCss,/\.lpa-model-menu\{[^}]*background-color:var\(--dsw-alias-bg-layer-1,var\(--lpa-menu-base,transparent\)\)/);
 assert.match(pickerCss,/\.lpa-model-group-name\{[^}]*background-color:var\(--dsw-alias-bg-layer-1/);
 assert.match(pickerCss,/\.lpa-model-flyout\{[^}]*background-color:var\(--dsw-alias-bg-layer-1/);
 assert.match(pickerCss,/\.lpa-model-scroll\{[^}]*overflow-x:hidden/);
 assert.match(pickerCss,/\.lpa-model-menu\[data-style='zcode'\] \.lpa-model-option\{[^}]*width:calc\(100% - 4px\)/);
 assert.doesNotMatch(pickerCss,/lpa-model-menu\{[^}]*bg-overlay/);
});

test('zcode menu wires the ZCode-style region dividers',async()=>{
 const fsp=await import('node:fs/promises');
 const src=await fsp.readFile(new URL('../assist/client/model-picker.js',import.meta.url),'utf8');
 assert.match(pickerCss,/\.lpa-model-menu\[data-style='zcode'\] \.lpa-zt-divider\{[^}]*height:1px/);
 assert.match(pickerCss,/\.lpa-zt-divider\{[^}]*10%,transparent\)/);
 // two literal divider elements (under the provider row and under the submenu back row);
 // the pre-effort divider reuses one element, so the class string appears exactly twice.
 assert.equal((src.match(/className:'lpa-zt-divider'/g)||[]).length,2);
 assert.match(src,/rows\.length\?zcDivider:null/);
});
