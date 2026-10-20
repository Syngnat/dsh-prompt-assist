// Real Chrome/React motion regression. Uses only the offline about:blank fixture.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {withBrowser} from './run-model-picker-browser.mjs';
import {prepare,settle} from './test-model-picker-layout.mjs';

const rootSelector='.lpa-effort.lpa-ce';
const trackSelector='.lpa-effort-slider.lpa-ce-track';
const inputSelector=trackSelector+' input[type=range]';
const artifactDirectory=resolve('output/playwright');
const evidenceDirectory=resolve('.release-check/model-picker-motion');
const approximately=(actual,expected,tolerance=0.6,message='CSS pixels')=>assert.ok(
 Math.abs(actual-expected)<=tolerance,`${message}: expected ${expected} +/- ${tolerance}, received ${actual}`);
const cssList=value=>value.split(/,\s*(?![^()]*\))/).map(part=>part.trim());
const milliseconds=value=>Number.parseFloat(value)*(value.trim().endsWith('ms')?1:1000);
function transition(style,property){
 const names=cssList(style.transitionProperty),durations=cssList(style.transitionDuration),easings=cssList(style.transitionTimingFunction);
 const at=names.indexOf(property);assert.ok(at>=0,`Missing ${property} transition: ${style.transitionProperty}`);
 return {duration:milliseconds(durations[at%durations.length]),easing:easings[at%easings.length]};
}

export async function motionGeometry(page){
 return page.evaluate(({rootSelector,trackSelector,inputSelector})=>{
  const root=document.querySelector(rootSelector),track=document.querySelector(trackSelector),input=document.querySelector(inputSelector);
  const knob=root?.querySelector('.lpa-ce-knob'),fill=root?.querySelector('.lpa-ce-fill');
  if(!root||!track||!input||!knob||!fill)throw Error('Claude effort visual is not integrated: expected .lpa-effort.lpa-ce, .lpa-ce-track, .lpa-ce-knob and .lpa-ce-fill.');
  const rect=node=>{const b=node.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
  const properties=style=>Object.fromEntries(['width','height','borderRadius','translate','scale','opacity','transitionProperty','transitionDuration','transitionTimingFunction','animationName','animationDuration'].map(key=>[key,style[key]]));
  const ks=getComputedStyle(knob),ts=getComputedStyle(track),rail=getComputedStyle(track,'::before');
  const label=root.querySelector('.lpa-ce-value'),ghost=root.querySelector('.lpa-ce-value-ghost');
  return {root:rect(root),track:rect(track),input:rect(input),knob:rect(knob),knobStyle:properties(ks),railStyle:properties(rail),trackStyle:properties(ts),fillStyle:properties(getComputedStyle(fill)),
   travel:ks.translate==='none'?0:parseFloat(ks.translate),inputValue:Number(input.value),max:Number(input.max),disabled:input.disabled,apex:root.hasAttribute('data-apex'),dragging:root.hasAttribute('data-dragging'),
   label:label?{text:label.textContent,...properties(getComputedStyle(label))}:null,ghost:ghost?{text:ghost.textContent,...properties(getComputedStyle(ghost))}:null};
 },{rootSelector,trackSelector,inputSelector});
}

export async function openMotionFixture(page,options={}){
 await page.mouse.up();
 await page.evaluate(options=>window.fixture.mount(options),options);
 await settle(page);
 await page.locator('.lpa-model-trigger').click();
 await page.locator(rootSelector).waitFor({state:'visible'});
 await settle(page);
 return motionGeometry(page);
}

export async function moveMotionPointer(page,ratio){
 const b=await page.locator(inputSelector).boundingBox();assert.ok(b,'Missing native range geometry');
 await page.mouse.move(b.x+8+(b.width-16)*ratio,b.y+b.height/2);
}
async function beginDrag(page){
 const g=await motionGeometry(page);
 await moveMotionPointer(page,g.max?g.inputValue/g.max:0);
 await page.mouse.down();
 return g;
}
const selectionCount=page=>page.evaluate(()=>window.fixture.calls().selections.length);
async function sampleTravel(page,duration=280){
 return page.evaluate(duration=>new Promise(resolve=>{
  const samples=[],start=performance.now();
  function frame(){const now=performance.now(),knob=document.querySelector('.lpa-ce-knob');samples.push({ms:now-start,x:parseFloat(getComputedStyle(knob).translate)||0});if(now-start<duration)requestAnimationFrame(frame);else resolve(samples);}
  requestAnimationFrame(frame);
 }),duration);
}
async function waitForStop(page,index){
 await page.waitForFunction(({index,trackSelector})=>{
  const track=document.querySelector(trackSelector),knob=track?.querySelector('.lpa-ce-knob'),input=track?.querySelector('input');
  if(!track||!knob||!input)return false;
  const x=parseFloat(getComputedStyle(knob).translate)||0,target=index*(track.getBoundingClientRect().width-16)/Number(input.max);
  return Math.abs(x-target)<1.1&&Math.abs((parseFloat(getComputedStyle(knob).scale)||1)-1)<0.002;
 },{index,trackSelector});
 return motionGeometry(page);
}
const defaultSnapshot=effort=>({current:{provider:'openai',model:'gpt-6-astra',reasoningEffort:effort}});
function captureSourceHashes(){
 const files=['scripts/run-model-picker-browser.mjs','scripts/test-model-picker-layout.mjs',...readdirSync(resolve('assist/client')).filter(name=>/claude.*effort|effort.*visual|^model-picker|^model-descriptions|^messages\.js$/.test(name)).map(name=>'assist/client/'+name)];
 return Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(resolve(file))).digest('hex')]));
}

export async function runMotionRegression(page){
 const sourceHashes=captureSourceHashes();
 await prepare(page,{width:460,height:700});
 await page.locator('.lpa-model-trigger').click();
 await page.locator(rootSelector).waitFor({state:'visible'});
 await settle(page);
 const results=[];
 const check=async(name,run)=>{
  try{await page.emulateMedia({reducedMotion:'no-preference'});const evidence=await run();results.push({name,passed:true,evidence});}
  catch(error){
   const screenshot=resolve(artifactDirectory,`model-picker-motion-failure-${results.length+1}.png`);
   await page.screenshot({path:screenshot,animations:'allow'}).catch(()=>{});
   results.push({name,passed:false,error:error.stack??String(error),screenshot});
  }finally{await page.mouse.up();}
 };

 await check('exact computed shape, rail and native-input movement endpoints',async()=>{
  await openMotionFixture(page);await waitForStop(page,2);const g=await motionGeometry(page);
  assert.equal(await page.locator('.lpa-model-option').count(),8,'Use the actual grouped picker');
  assert.ok(await page.locator('.lpa-model-desc').count()>3,'Use builtin descriptions');
  approximately(parseFloat(g.knobStyle.width),16,0.01,'Knob width');approximately(parseFloat(g.knobStyle.height),30,0.01,'Knob height');assert.equal(g.knobStyle.borderRadius,'5px');
  approximately(g.track.height,30,0.01,'Hit track height');approximately(parseFloat(g.railStyle.height),26,0.01,'Rail height');assert.equal(g.railStyle.borderRadius,'8px');
  approximately(g.input.x,g.track.x,0.01,'Native input left');approximately(g.input.width,g.track.width,0.01,'Native input width');
  await beginDrag(page);await moveMotionPointer(page,0);await settle(page);let endpoint=await motionGeometry(page);
  approximately(endpoint.knob.x+endpoint.knob.width/2,g.input.x+8,0.6,'Left knob centre');assert.equal(endpoint.inputValue,0);
  await moveMotionPointer(page,1);await settle(page);endpoint=await motionGeometry(page);
  approximately(endpoint.knob.x+endpoint.knob.width/2,g.input.right-8,0.6,'Right knob centre');assert.equal(endpoint.inputValue,3);
  assert.equal(await selectionCount(page),0);await page.locator(inputSelector).dispatchEvent('pointercancel',{pointerId:1});
  return g;
 });

 await check('computed release/fill timing and 150ms, 4px outgoing/incoming label animations',async()=>{
  await openMotionFixture(page);await waitForStop(page,2);const g=await motionGeometry(page);
  const knob=transition(g.knobStyle,'translate'),fill=transition(g.fillStyle,'width');
  assert.equal(knob.duration,200);assert.equal(knob.easing,'cubic-bezier(0.22, 0.61, 0.36, 1)');assert.deepEqual(fill,knob);
  await beginDrag(page);await moveMotionPointer(page,0);await settle(page);
  const labels=await page.evaluate(()=>Object.fromEntries(['value','value-ghost'].map(suffix=>{
   const node=document.querySelector('.lpa-ce-'+suffix),style=getComputedStyle(node);
   const animations=node.getAnimations().map(animation=>({duration:animation.effect.getTiming().duration,keyframes:animation.effect.getKeyframes().map(frame=>({opacity:frame.opacity,filter:frame.filter,y:new DOMMatrix(frame.transform==='none'?undefined:frame.transform).m42}))}));
   return [suffix,{text:node.textContent,name:style.animationName,duration:style.animationDuration,animations}];
  })));
  for(const label of Object.values(labels)){assert.ok(label.text);assert.notEqual(label.name,'none');assert.equal(milliseconds(cssList(label.duration)[0]),150);assert.ok(label.animations.some(a=>a.duration===150));}
  assert.notEqual(labels.value.text,labels['value-ghost'].text);
  assert.ok(labels.value.animations.some(a=>a.keyframes.some(k=>k.y===4)),'Incoming label rises 4px');
  assert.ok(labels['value-ghost'].animations.some(a=>a.keyframes.some(k=>k.y===-4)),'Outgoing label rises 4px');
  await page.locator(inputSelector).dispatchEvent('pointercancel',{pointerId:1});
  return {knob,fill,labels};
 });

 await check('real pointer follows continuous 0.8 sinusoidal detent, native enum remains discrete, submit once on release',async()=>{
  const g=await openMotionFixture(page);await beginDrag(page);const samples=[];
  for(const ratio of [0.08,0.19,0.24,0.41,0.47,0.57,0.74,0.81,0.41]){
   await moveMotionPointer(page,ratio);await settle(page);const s=await motionGeometry(page),part=ratio*s.max,segment=Math.floor(part),t=part-segment;
   const expected=(segment+t-0.8*Math.sin(2*Math.PI*t)/(2*Math.PI))/s.max*(s.track.width-16);
   approximately(s.travel,expected,1.15,`Magnetic travel at ${ratio}`);assert.equal(s.inputValue,Math.round(part));assert.ok(Number.isInteger(s.inputValue)&&s.inputValue>=0&&s.inputValue<=s.max);
   assert.equal(await selectionCount(page),0,'No selection while pointer is held');assert.ok(!cssList(s.knobStyle.transitionProperty).includes('translate'),'Held travel has no easing lag');
   samples.push({ratio,travel:s.travel,expected,index:s.inputValue});
  }
  assert.ok(samples.some(s=>Math.abs(s.travel-s.index/g.max*(g.track.width-16))>8),'Actual visual must occupy positions between enum stops');
  await page.mouse.up();await settle(page);assert.equal(await selectionCount(page),1);
  assert.equal(await page.evaluate(()=>window.fixture.calls().selections[0].reasoningEffort),'medium');
  return {samples,selections:await selectionCount(page)};
 });

 await check('held scale is 1.1 and release physically interpolates to its stop',async()=>{
  await openMotionFixture(page);await beginDrag(page);await moveMotionPointer(page,0.41);
  await page.waitForFunction(()=>Math.abs(parseFloat(getComputedStyle(document.querySelector('.lpa-ce-knob')).scale)-1.1)<0.002);
  const held=await motionGeometry(page);approximately(parseFloat(held.knobStyle.scale),1.1,0.002,'Held scale');
  await page.mouse.up();const samples=await sampleTravel(page),rest=await waitForStop(page,1),target=(rest.track.width-16)/rest.max;
  assert.ok(samples.some(s=>Math.abs(s.x-held.travel)>0.3&&Math.abs(s.x-target)>0.3),'Observe actual intermediate release positions');
  approximately(rest.travel,target,1.1,'Released position');assert.equal(await selectionCount(page),1);
  return {held:held.travel,target,samples};
 });

 await check('apex has five rows, violet pixels and actual time-varying computed colors',async()=>{
  await openMotionFixture(page,{snapshot:defaultSnapshot('xhigh')});await waitForStop(page,3);
  const matrix=await page.evaluate(()=>{
   const root=document.querySelector('.lpa-ce'),node=root.querySelector('.lpa-ce-matrix'),squares=[...node.querySelectorAll('.lpa-ce-matrix-sq')],style=getComputedStyle(root);
   return {apex:root.hasAttribute('data-apex'),display:getComputedStyle(node).display,count:squares.length,rows:[...new Set(squares.map(sq=>sq.getBoundingClientRect().y))],
    flashTokens:[...style].filter(key=>key.startsWith('--')&&/period.*flash|flash.*period/i.test(key)).map(key=>[key,style.getPropertyValue(key).trim()]),
    durations:squares.map(sq=>getComputedStyle(sq).animationDuration),colors:squares.map(sq=>getComputedStyle(sq).backgroundColor)};
  });
  assert.equal(matrix.apex,true);assert.equal(matrix.display,'grid');assert.equal(matrix.rows.length,5);assert.ok(matrix.count>=100);
  assert.ok(matrix.flashTokens.some(([,value])=>milliseconds(value)===1450),'Source flash period is 1450ms');
  for(const duration of matrix.durations){const ms=milliseconds(cssList(duration)[0]);assert.ok(ms>=1333&&ms<=1567,`Source-scattered flash duration: ${duration}`);}
  const snapshots=await page.evaluate(()=>new Promise(resolve=>{
   const samples=[],start=performance.now();let last=-200;
   function frame(now){if(now-last>=100){samples.push({ms:now-start,colors:[...document.querySelectorAll('.lpa-ce-matrix-sq')].map(sq=>getComputedStyle(sq).backgroundColor)});last=now;}if(now-start<1800)requestAnimationFrame(frame);else resolve(samples);}
   requestAnimationFrame(frame);
  }));
  const changed=matrix.colors.reduce((n,_,i)=>n+(new Set(snapshots.map(s=>s.colors[i])).size>1?1:0),0);
  assert.ok(changed>matrix.count/3,`Computed square colors must actually animate: ${changed}/${matrix.count}`);
  const purple=await page.evaluate(()=>{const c=document.createElement('canvas').getContext('2d');return [...document.querySelectorAll('.lpa-ce-matrix-sq')].some(sq=>{c.clearRect(0,0,1,1);c.fillStyle=getComputedStyle(sq).backgroundColor;c.fillRect(0,0,1,1);const [r,g,b]=c.getImageData(0,0,1,1).data;return b>r+10&&b>g+10;});});
  assert.equal(purple,true,'The actual computed pixel colors are violet');
  return {rows:matrix.rows.length,pixels:matrix.count,changedPixels:changed,flashTokens:matrix.flashTokens,durationRangeMs:[Math.min(...matrix.durations.map(milliseconds)),Math.max(...matrix.durations.map(milliseconds))],sampleCount:snapshots.length};
 });

 await check('reduced motion disables all component animations/transitions and pointer selection still works',async()=>{
  await page.emulateMedia({reducedMotion:'reduce'});await openMotionFixture(page,{snapshot:defaultSnapshot('xhigh')});
  const before=await page.evaluate(()=>{
   const root=document.querySelector('.lpa-ce');return {styles:[root,...root.querySelectorAll('*')].map(node=>{const s=getComputedStyle(node);return {className:node.className,animationName:s.animationName,animationDuration:s.animationDuration,transitionDuration:s.transitionDuration};}),
    running:root.getAnimations({subtree:true}).filter(a=>a.playState==='running').length,colors:[...root.querySelectorAll('.lpa-ce-matrix-sq')].map(sq=>getComputedStyle(sq).backgroundColor)};
  });
  assert.equal(before.running,0);for(const style of before.styles){assert.ok(cssList(style.animationName).every(name=>name==='none'),`Reduced animation ${style.className}: ${style.animationName}`);assert.ok(cssList(style.transitionDuration).every(value=>milliseconds(value)===0),`Reduced transition ${style.className}: ${style.transitionDuration}`);}
  await sampleTravel(page,350);const after=await page.locator('.lpa-ce-matrix-sq').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node).backgroundColor));assert.deepEqual(after,before.colors);
  await beginDrag(page);await moveMotionPointer(page,0.41);await settle(page);assert.equal(await selectionCount(page),0);const held=await motionGeometry(page);assert.equal(held.inputValue,1);
  await page.mouse.up();await settle(page);assert.equal(await selectionCount(page),1);await waitForStop(page,1);
  return {animatedElements:before.running,checkedElements:before.styles.length,stablePixels:after.length,selection:'medium'};
 });

 await check('pointercancel cancels the held gesture without a selection',async()=>{
  await openMotionFixture(page);await beginDrag(page);await moveMotionPointer(page,0.14);await settle(page);
  await page.locator(inputSelector).dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();await settle(page);
  assert.equal(await selectionCount(page),0);const rest=await waitForStop(page,2);assert.equal(rest.inputValue,2);return {selections:0,rest:rest.travel};
 });
 await check('a model change during drag cancels submission',async()=>{
  await openMotionFixture(page);await beginDrag(page);await moveMotionPointer(page,0.14);
  await page.evaluate(()=>window.fixture.patch({current:{provider:'openai',model:'gpt-5.2',reasoningEffort:'high'}}));await settle(page);
  await moveMotionPointer(page,0);await page.mouse.up();await settle(page);assert.equal(await selectionCount(page),0);assert.equal((await motionGeometry(page)).max,1);return {selections:0};
 });
 await check('a changed effort catalog during drag cancels submission',async()=>{
  await openMotionFixture(page);await beginDrag(page);await moveMotionPointer(page,0.14);
  await page.evaluate(()=>{const groups=structuredClone(window.fixture.state().groups);groups[2].models[0].reasoning.efforts.reverse();window.fixture.patch({groups});});await settle(page);
  await moveMotionPointer(page,0);await page.mouse.up();await settle(page);assert.equal(await selectionCount(page),0);return {selections:0};
 });
 await check('locking during drag prevents submission and dismisses the menu',async()=>{
  await openMotionFixture(page);await beginDrag(page);await moveMotionPointer(page,0.14);
  await page.evaluate(()=>window.fixture.props({locked:true}));await settle(page);await page.mouse.up();await settle(page);
  assert.equal(await selectionCount(page),0);assert.equal(await page.locator('.lpa-model-menu').count(),0);assert.equal(await page.locator('.lpa-model-trigger').isDisabled(),true);return {selections:0};
 });
 await check('delayed success keeps the committed visual while the store still names the old effort',async()=>{
  await openMotionFixture(page,{defer:true});await beginDrag(page);await moveMotionPointer(page,0.1);await page.mouse.up();await settle(page);
  assert.equal(await selectionCount(page),1);assert.equal(await page.evaluate(()=>window.fixture.state().current.reasoningEffort),'high');assert.equal(await page.locator(inputSelector).isDisabled(),true);
  const samples=await sampleTravel(page,700),settledSamples=samples.filter(s=>s.ms>=250);assert.ok(settledSamples.length>=3,'Observe the pending state after the 200ms snap');
  assert.ok(settledSamples.every(s=>Math.abs(s.x)<1.1),`Pending visual must remain on low, without bouncing back to high; observed ${JSON.stringify(settledSamples.filter(s=>Math.abs(s.x)>=1.1).slice(0,3))}`);
  assert.equal((await motionGeometry(page)).inputValue,0);await page.evaluate(()=>window.fixture.resolve());await settle(page);const rest=await waitForStop(page,0);
  assert.equal(await page.evaluate(()=>window.fixture.state().current.reasoningEffort),'low');assert.equal(rest.disabled,false);return {pendingStoreEffort:'high',pendingVisualIndex:0,samples};
 });
 await check('delayed failure holds the pending visual then restores the actual effort',async()=>{
  await openMotionFixture(page,{defer:true,fail:true});await beginDrag(page);await moveMotionPointer(page,0.1);await page.mouse.up();await settle(page);
  assert.equal(await selectionCount(page),1);const samples=await sampleTravel(page,450),settledSamples=samples.filter(s=>s.ms>=250);assert.ok(settledSamples.length>=3,'Observe the pending state after the 200ms snap');
  assert.ok(settledSamples.every(s=>Math.abs(s.x)<1.1),`A failed request must still hold its pending visual until it resolves; observed ${JSON.stringify(settledSamples.filter(s=>Math.abs(s.x)>=1.1).slice(0,3))}`);
  await page.evaluate(()=>window.fixture.resolve());await settle(page);const rest=await waitForStop(page,2);assert.equal(rest.inputValue,2);assert.equal(rest.disabled,false);
  assert.match(await page.locator('[role=alert]').textContent(),/其他 DSH/);assert.equal(await page.evaluate(()=>window.fixture.state().current.reasoningEffort),'high');return {selections:1,revertedIndex:rest.inputValue,pendingSamples:samples};
 });
 await page.emulateMedia({reducedMotion:'no-preference'});
 const sourcesUnchanged=JSON.stringify(sourceHashes)===JSON.stringify(captureSourceHashes());
 return {passed:sourcesUnchanged&&results.every(result=>result.passed),cases:results.length,passedCases:results.filter(result=>result.passed).length,failedCases:results.filter(result=>!result.passed).length,browser:page.context().browser().version(),url:page.url(),modelCalls:0,sourceHashes,sourcesUnchanged,results};
}

async function main(){
 mkdirSync(artifactDirectory,{recursive:true});mkdirSync(evidenceDirectory,{recursive:true});
 const path=resolve(evidenceDirectory,'browser-regression.json');
 try{
  const report=await withBrowser(runMotionRegression);writeFileSync(path,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));assert.equal(report.passed,true,`Motion regression failed; inspect ${path}`);
 }catch(error){
  if(!String(error.message).startsWith('Motion regression failed'))writeFileSync(path,JSON.stringify({passed:false,error:error.stack??String(error)},null,2)+'\n');
  console.error(error.stack??String(error));process.exitCode=1;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
