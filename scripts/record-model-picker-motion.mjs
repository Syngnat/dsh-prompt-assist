// Finite, timestamped screenshots of the real offline React picker, then GIF encoding.
// Importing this module never launches a browser, records frames or writes files.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {setTimeout as delay} from 'node:timers/promises';
import {spawnSync} from 'node:child_process';
import {withBrowser} from './run-model-picker-browser.mjs';
import {prepare,settle} from './test-model-picker-layout.mjs';
import {motionGeometry,moveMotionPointer} from './test-model-picker-motion.mjs';

const defaultOutput=resolve('output/playwright');
const python=String.raw`C:\Users\yangguofeng\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe`;
const encoder=fileURLToPath(new URL('./encode-model-picker-gif.py',import.meta.url));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function recordMotion(page,{outputDirectory=defaultOutput,fps=15}={}){
 assert.ok(Number.isFinite(fps)&&fps>=10&&fps<=30,'Use a finite capture rate between 10 and 30fps');
 await prepare(page,{width:460,height:700});
 await page.evaluate(()=>{
  const label=document.querySelector('body > p');
  label.textContent='合成目录 · 无用户配置 · 无网络或模型请求';
  label.dataset.motionFixture='synthetic-offline';
 });
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('.lpa-model-trigger').click();
 await page.locator('.lpa-effort.lpa-ce').waitFor({state:'visible'});
 await settle(page);
 const initial=await motionGeometry(page);
 assert.equal(initial.max,3);assert.equal(initial.inputValue,2);
 assert.equal(initial.knobStyle.width,'16px');assert.equal(initial.knobStyle.height,'30px');
 assert.ok(await page.locator('.lpa-model-desc').count()>3,'Record builtin model descriptions above the actual slider');
 const clip={x:0,y:0,width:460,height:700};
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const framesDirectory=resolve(outputDirectory,'model-picker-motion-frames',stamp);
 mkdirSync(framesDirectory,{recursive:true});
 const sourceFiles=['scripts/run-model-picker-browser.mjs','scripts/test-model-picker-layout.mjs',...readdirSync(resolve('assist/client')).filter(name=>/claude.*effort|effort.*visual|^model-picker|^model-descriptions|^messages\.js$/.test(name)).map(name=>'assist/client/'+name)];
 const sourceHashes=Object.fromEntries(sourceFiles.map(file=>[file,sha256(readFileSync(resolve(file)))]));
 const dpr=await page.evaluate(()=>devicePixelRatio),cdp=await page.context().newCDPSession(page);
 const origin=performance.now(),wallOrigin=Date.now(),frames=[],pendingFrames=new Set();
 let phase='normal high',streaming=false,captureError=null,firstFrameTimestamp=null,nextCaptureTimestamp=0;
 let firstFrameReady;const firstFrame=new Promise(resolve=>{firstFrameReady=resolve;});
 const manifestPath=resolve(framesDirectory,'manifest.json');
 const writeManifest=(complete,error)=>{
  const manifest={format:'real-browser-png-sequence-v1',complete,createdAt:new Date(wallOrigin).toISOString(),browser:page.context().browser().version(),url:page.url(),viewport:page.viewportSize(),clip,deviceScaleFactor:dpr,screenshotScale:'css',requestedFps:fps,
   captureMethod:'Chrome Page.startScreencast PNG; original browser frames sampled at approximately 15fps; PNG dimensions asserted.',
   timestampMethod:'Chrome screencast frame swap timestamps (seconds since epoch); frame intervals retained without interpolation. Host receipt timestamps retained separately.',
   fixtureLabel:'合成目录 · 无用户配置 · 无网络或模型请求',sourceHashes,modelCalls:0,network:'Blocked by withBrowser; zero requests asserted before browser cleanup.',
   effortRect:initial.root,trackRect:initial.track,endAtMs:Number((firstFrameTimestamp===null?performance.now()-origin:Date.now()-firstFrameTimestamp).toFixed(3)),capturedFrames:frames.length,frames,...(error?{error:error.stack??String(error)}:{})};
  writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');return manifest;
 };
 async function acceptFrame(event){
  const receivedAt=performance.now(),framePhase=phase,timestamp=event.metadata.timestamp*1000;
  try{
   if(!streaming)return;
   assert.ok(Number.isFinite(timestamp),'Chrome must provide a real frame timestamp');
   if(firstFrameTimestamp===null){firstFrameTimestamp=timestamp;nextCaptureTimestamp=timestamp;}
   if(timestamp<nextCaptureTimestamp-2)return;
   nextCaptureTimestamp=Math.max(nextCaptureTimestamp+1000/fps,timestamp+1000/fps/4);
   const bytes=Buffer.from(event.data,'base64');
   assert.equal(bytes.readUInt32BE(16),clip.width);assert.equal(bytes.readUInt32BE(20),clip.height);
   const file=`frame-${String(frames.length).padStart(4,'0')}.png`,path=resolve(framesDirectory,file);
   const frame={file,phase:framePhase,capturedAtMs:Number((timestamp-firstFrameTimestamp).toFixed(3)),hostReceivedAtMs:Number((receivedAt-origin).toFixed(3)),timestamp:new Date(timestamp).toISOString(),chromeMetadata:event.metadata,sha256:sha256(bytes)};
   frames.push(frame);writeFileSync(path,bytes);
   frame.state=await page.evaluate(()=>{
   const root=document.querySelector('.lpa-ce'),knob=root?.querySelector('.lpa-ce-knob'),input=root?.querySelector('input[type=range]');
   if(!root||!knob||!input)throw Error('The real effort control disappeared while recording');
   return {travel:parseFloat(getComputedStyle(knob).translate)||0,scale:getComputedStyle(knob).scale,index:Number(input.value),apex:root.hasAttribute('data-apex'),dragging:root.hasAttribute('data-dragging'),label:root.querySelector('.lpa-ce-value')?.textContent,selections:window.fixture.calls().selections.length,
    pixelColors:[...root.querySelectorAll('.lpa-ce-matrix-sq')].filter((_,i)=>i%7===0).map(sq=>getComputedStyle(sq).backgroundColor)};
   });
   firstFrameReady();
  }catch(error){captureError??=error;firstFrameReady();}
  finally{await cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(error=>{if(streaming)captureError??=error;});}
 }
 const onFrame=event=>{
  const pending=acceptFrame(event);pendingFrames.add(pending);pending.finally(()=>pendingFrames.delete(pending));
 };
 async function stopStream(){
  if(streaming){streaming=false;await cdp.send('Page.stopScreencast');}
  await Promise.allSettled([...pendingFrames]);
 }
 async function hold(duration,nextPhase){
  phase=nextPhase;await delay(duration);if(captureError)throw captureError;
 }
 async function drag(from,to,duration,nextPhase){
  phase=nextPhase;const start=performance.now();
  do{
   const progress=Math.min(1,(performance.now()-start)/duration);
   await moveMotionPointer(page,from+(to-from)*progress);
   if(captureError)throw captureError;
   if(progress===1)break;
   await delay(1000/fps);
  }while(true);
 }
 async function down(ratio){await moveMotionPointer(page,ratio);await page.mouse.down();}
 try{
  cdp.on('Page.screencastFrame',onFrame);streaming=true;
  await cdp.send('Page.startScreencast',{format:'png',maxWidth:clip.width,maxHeight:clip.height,everyNthFrame:1});
  await Promise.race([firstFrame,delay(5000,null,{ref:false}).then(()=>{throw Error('Chrome did not deliver a real PNG frame');})]);
  if(captureError)throw captureError;
  await hold(350,'normal high');
  await down(2/3);await drag(2/3,0,650,'drag toward low');
  await drag(0,0.88,1250,'drag across stops toward apex');
  assert.equal(await page.evaluate(()=>window.fixture.calls().selections.length),0,'No fixture selection until real pointer release');
  await page.mouse.up();await hold(300,'release snap to apex');
  await hold(2000,'apex shimmer');
  const apexFrames=frames.filter(frame=>frame.phase==='apex shimmer'&&frame.state);
  assert.ok(apexFrames.length>=15&&apexFrames.every(frame=>frame.state?.apex),`Capture the actual apex matrix: ${apexFrames.length} frames`);
  assert.ok(new Set(apexFrames.map(frame=>JSON.stringify(frame.state.pixelColors))).size>=5,'Actual computed pixel colors changed while recording');
  await down(1);await drag(1,0.13,1150,'drag back down');
  await page.mouse.up();await hold(300,'release snap to low');
  await hold(200,'low');
  await down(0);await drag(0,2/3,600,'return toward high');
  await page.mouse.up();await hold(350,'restored high');
  assert.equal(await page.evaluate(()=>window.fixture.calls().selections.length),3,'Three offline fixture selections, each at release');
  await stopStream();if(captureError)throw captureError;
  const manifest=writeManifest(true);
  return {manifestPath,frames:frames.length,elapsedMs:manifest.endAtMs,outputDirectory};
 }catch(error){writeManifest(false,error);throw error;}
 finally{try{await stopStream();await page.mouse.up();}finally{cdp.off('Page.screencastFrame',onFrame);await cdp.detach();}}
}

export async function encodeMotion({manifestPath,outputDirectory=defaultOutput}){
 const gif=resolve(outputDirectory,'model-picker-motion.gif'),preview=resolve(outputDirectory,'model-picker-motion-preview.png');
 const result=spawnSync(python,[encoder,manifestPath,'--output',gif,'--preview',preview],{encoding:'utf8',windowsHide:true});
 if(result.error)throw result.error;
 assert.equal(result.status,0,`GIF encoding/verification failed:\n${result.stderr}\n${result.stdout}`);
 return {...JSON.parse(result.stdout.trim()),manifest:relative(process.cwd(),manifestPath).replaceAll('\\','/'),gif,preview};
}

async function main(){
 try{
  const capture=await withBrowser(page=>recordMotion(page));
  const report=await encodeMotion(capture);
  console.log(JSON.stringify({passed:true,...report,modelCalls:0},null,2));
 }catch(error){console.error(error.stack??String(error));process.exitCode=1;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
