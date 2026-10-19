// Browser geometry regression, not a replacement GUI or live-profile acceptance.
// Generates an about:blank-only fixture using the real ResultAnchor and Preview components.
import {buildSync} from 'esbuild';
import {mkdirSync,writeFileSync} from 'node:fs';
const entry=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ResultAnchor} from './assist/client/result-anchor.js';
import {Preview} from './assist/client/preview.js';
import {css} from './assist/client/style.js';
const h=React.createElement;
if(location.href!=='about:blank')throw Error('Layout fixture must never run in a real user page');
const style=document.createElement('style');style.textContent=css+\`
body{margin:0;font:14px sans-serif;--dsw-alias-bg-layer-1:white;--dsw-alias-label-primary:black;--dsw-alias-border-l1:#bbb}
.frame{height:calc(100vh / var(--fixture-scale,1));box-sizing:border-box;padding:24px;display:flex;overflow:hidden}
.viewport{flex:1;min-width:0;overflow:auto}.stack{height:100%;width:min(840px,100%);margin:auto;display:flex;flex-direction:column;gap:8px;justify-content:center}
.slot{display:contents}.headline{height:32px;flex:none}.stats{display:none;height:120px;flex:0 1 120px;min-height:0;background:#eee}
.workspace{height:32px;flex:none}.bar{flex:none}.card{position:relative;width:100%;box-sizing:border-box;border:1px solid #aaa;padding-top:8px;background:white}
.overlay{height:0;position:absolute;inset:0 0 auto}.editor{height:64px;padding:8px;box-sizing:border-box}.toolbar{height:32px}
.studio .stack{justify-content:flex-start}.studio .stats{display:block}
/* Minimal reproduction of the observed theme rule: all dock entries precede an auto-margin workspace row. */
.studio .stack>.dock>*{order:1;flex:0 1 auto;min-height:0;width:480px;max-width:100%;margin-right:auto}
.studio .workspace{order:2;margin-top:auto}.studio .stack>.composer>*{order:3}
.active .stack{justify-content:flex-end}.active .headline,.active .workspace{display:none}
.native-menu{position:absolute;left:0;right:0;bottom:4px;height:80px;z-index:100;background:#eee}
\`;document.head.append(style);
const target=document.createElement('div');document.body.append(target);const root=createRoot(target);
let actions=0,observers=0;const NativeObserver=window.ResizeObserver;
window.ResizeObserver=class extends NativeObserver{constructor(fn){super(fn);observers++;this.live=true;}disconnect(){if(this.live){observers--;this.live=false;}super.disconnect();}};
function App({mode,kind,legacy=false,menu=false,scale=1,session='fixture',concealed=false,tight=false}){
 document.body.style.zoom=String(scale);document.body.style.setProperty('--fixture-scale',String(scale));
 const value={sessionId:session,feature:kind==='suggest'?'suggest':'enhance',streaming:kind==='streaming',snapshot:{structured:false},original:'Original fixture',text:kind==='short'?'Clear result.':'Result line.\\n'.repeat(80)};
 const runtime={sessionId:session,allowed:true,busy:false,dirty:false,result:{preview:value},controller:{cancel:()=>actions++,dismiss:()=>actions++},setNotice(){}};
 const modifier=kind==='pending'?' lpa-inline--pending':kind==='undo'?' lpa-inline--undo':'';
 const content=['pending','undo'].includes(kind)?h('div',{className:kind==='undo'?'lpa-undo-actions':'lpa-row lpa-pending'},h('button',{className:'lpa-button',onClick:()=>actions++},kind)):h(Preview,{runtime,actions:{},t:key=>key,onApplied(){}});
 const panel=h('section',{className:'lpa lpa-inline'+modifier},content);
 return h('div',{className:'frame '+mode,style:{visibility:concealed?'hidden':'visible'}},h('div',{className:'viewport'},h('div',{className:'stack'},
 h('div',{className:'headline'},'Synthetic header'),h('div',{className:'slot dock'},h('div',{className:'stats'},'Synthetic stats'),legacy?panel:null),
 h('div',{className:'workspace'},'Synthetic workspace row'),h('div',{className:'slot composer'},h('div',{className:'bar',style:tight?{overflow:'hidden',paddingTop:22}:undefined},h('div',{className:'card','data-composer-card':''},
 h('div',{className:'overlay','data-composer-overlay':''},menu?h('button',{className:'native-menu'},'Native menu fixture'):null,legacy?null:h(ResultAnchor,{key:session},panel)),
 h('div',{className:'editor',contentEditable:true,suppressContentEditableWarning:true},'Unsent fixture'),h('div',{className:'toolbar'},'Synthetic toolbar')))))));
}
window.anchorFixture={render:props=>root.render(h(App,props)),counts:()=>({actions,observers}),dispose:()=>{root.unmount();window.ResizeObserver=NativeObserver;target.remove();style.remove();}};
`;
const bundle=buildSync({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'anchor-fixture-entry.js'},bundle:true,write:false,platform:'browser',format:'iife'}).outputFiles[0].text;
async function probe(page,bundle){
 await page.goto('about:blank');await page.addScriptTag({content:bundle});
 const results=[],failures=[];
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
 try{
  await page.setViewportSize({width:1280,height:720});
  await page.evaluate(()=>window.anchorFixture.render({mode:'studio',kind:'short',legacy:true}));await settle();
  const oldGap=await page.evaluate(()=>document.querySelector('.card').getBoundingClientRect().top-document.querySelector('.lpa-inline').getBoundingClientRect().bottom);
  if(oldGap<80)throw Error('Fixture did not reproduce the original detached dock');
  for(const viewport of [{width:1280,height:720},{width:1024,height:576},{width:640,height:360},{width:480,height:640},{width:2560,height:1368}]){
   await page.setViewportSize(viewport);
   for(const mode of ['hero','studio','active'])for(const kind of ['short','long','streaming','pending','undo','suggest']){
    await page.evaluate(props=>window.anchorFixture.render(props),{mode,kind});await settle();
    const row=await page.evaluate(()=>{
     const panel=document.querySelector('.lpa-inline'),card=document.querySelector('.card'),scroll=document.querySelector('.viewport');
     const p=panel.getBoundingClientRect(),c=card.getBoundingClientRect(),s=scroll.getBoundingClientRect();
     const button=panel.querySelector('.lpa-preview-actions button:last-child,.lpa-pending button,.lpa-undo-actions button');
     button.scrollIntoView({block:'nearest'});const b=button.getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
     return {gap:c.top-p.bottom,top:p.top,clipTop:s.top,width:p.width,cardWidth:c.width,horizontalOverflow:panel.scrollWidth>panel.clientWidth+1,reachable:hit===button||button.contains(hit),observers:window.anchorFixture.counts().observers};
    });
    row.mode=mode;row.kind=kind;row.viewport=viewport;results.push(row);
    if(Math.abs(row.gap-8)>2||row.top<row.clipTop-1||row.horizontalOverflow||!row.reachable||row.observers!==1)failures.push(row);
   }
  }
  await page.setViewportSize({width:1280,height:720});
  for(const scale of [.8,1.25,1.5]){
   await page.evaluate(props=>window.anchorFixture.render(props),{mode:'studio',kind:'long',scale});await settle();
   const row=await page.evaluate(()=>{const p=document.querySelector('.lpa-inline').getBoundingClientRect(),c=document.querySelector('.card').getBoundingClientRect(),s=document.querySelector('.viewport').getBoundingClientRect();return {gap:c.top-p.bottom,top:p.top,clipTop:s.top};});
   row.scale=scale;results.push(row);if(Math.abs(row.gap-8*scale)>2||row.top<row.clipTop-1)failures.push(row);
  }
  await page.evaluate(()=>window.anchorFixture.render({mode:'active',kind:'short',concealed:true}));await settle();
  const visibilityInherited=await page.evaluate(()=>getComputedStyle(document.querySelector('.lpa-inline')).visibility==='hidden');
  if(!visibilityInherited)failures.push({hiddenComposerExposesResult:true});
  await page.evaluate(()=>window.anchorFixture.render({mode:'active',kind:'short',tight:true}));await settle();
  const tinyHidden=await page.evaluate(()=>getComputedStyle(document.querySelector('.lpa-inline')).visibility==='hidden');
  if(!tinyHidden)failures.push({insufficientClearanceExposesResult:true});
  await page.evaluate(()=>window.anchorFixture.render({mode:'studio',kind:'short',menu:true,session:'second'}));await settle();
  const nativeOnTop=await page.evaluate(()=>{const m=document.querySelector('.native-menu'),b=m.getBoundingClientRect();return document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)===m;});
  if(!nativeOnTop)failures.push({nativeMenuBlocked:true});
  await page.evaluate(()=>window.anchorFixture.render({mode:'active',kind:'short',session:'second'}));await settle();
  await page.locator('.lpa-preview-actions button:last-child').click();
  const counts=await page.evaluate(()=>window.anchorFixture.counts());if(counts.actions!==1||counts.observers!==1)failures.push({counts});
  await page.evaluate(()=>window.anchorFixture.dispose());
  const disposed=await page.evaluate(()=>window.anchorFixture.counts());if(disposed.observers!==0)failures.push({leakedObservers:disposed.observers});
  return {fixtureOnly:true,modelCalls:0,oldDetachedGap:oldGap,passed:failures.length===0,cases:results.length,nativeOnTop,visibilityInherited,tinyHidden,disposed,failures};
 }finally{await page.goto('about:blank');}
}
mkdirSync('output/playwright',{recursive:true});
writeFileSync('output/playwright/result-anchor-regression.cjs','async page => ('+probe.toString()+')(page,'+JSON.stringify(bundle)+')');
console.log('Generated output/playwright/result-anchor-regression.cjs (about:blank fixture only).');
