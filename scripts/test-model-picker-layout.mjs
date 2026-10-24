// Actual React component; mock catalog only. No network or real profile/model calls.
import {buildSync} from 'esbuild';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const entry=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ModelPicker} from './assist/client/model-picker.js';
import {dictionaries} from './assist/client/messages.js';
if(location.href!=='about:blank')throw Error('Fixture only supports about:blank');
const theme=document.createElement('style');theme.textContent=\`:root{--dsw-alias-bg-base:#f7f8fc;--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-overlay:#fff;--dsw-alias-bg-layer-2:#e9ebef;--dsw-alias-border-l1:#e0e4ed;--dsw-alias-label-primary:#191d25;--dsw-alias-label-secondary:#69707d;--dsw-alias-label-tertiary:#8b919e;--dsw-alias-brand-primary:#1769e8;--dsw-alias-interactive-bg-hover:#f0f3f9;--dsw-alias-state-error-primary:#b52e3a}body{margin:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:13px system-ui,sans-serif}body.dark{--dsw-alias-bg-base:#17191f;--dsw-alias-bg-layer-1:#262931;--dsw-alias-bg-overlay:#262931;--dsw-alias-bg-layer-2:#383c46;--dsw-alias-border-l1:#454a57;--dsw-alias-label-primary:#eef0f6;--dsw-alias-label-secondary:#b6bdcb;--dsw-alias-label-tertiary:#a1aaba;--dsw-alias-brand-primary:#73a5ff;--dsw-alias-interactive-bg-hover:#333943}\`;document.head.append(theme);
const label=document.createElement('p');label.textContent='候选界面 · 模拟目录 · 未安装到当前 GUI';label.style.cssText='margin:20px 24px;color:var(--dsw-alias-label-secondary);font-size:12px';document.body.append(label);
const outside=document.createElement('button');outside.id='outside';outside.textContent='输入区域';outside.style.cssText='position:fixed;left:24px;top:60px;border:0;background:transparent;color:var(--dsw-alias-label-secondary)';document.body.append(outside);
const base={status:'ready',pending:null,error:null,failures:[],routable:true,current:{provider:'openai',model:'gpt-6-astra',reasoningEffort:'high'},groups:[
 {id:'xiaomi-token-plan-cn',name:'xiaomi-token-plan-cn',models:[{id:'mimo-v2.6-flash',name:'Xiaomi MiMo V2.6-Flash'},{id:'mimo-v2.6-pro',name:'Xiaomi MiMo V2.6-Pro'}]},
 {id:'opencode-cpa',name:'opencode-cpa',models:[{id:'安和桥/deepseek-v4.1-flash-free',name:'安和桥/deepseek v4.1-flash-free'},{id:'安和桥/glm-5.3-flash-free',name:'安和桥/GLM 5.3-flash-free'},{id:'安和桥/grok-4.7',name:'安和桥/Grok 4.7'},{id:'安和桥/minimax-m3.1-flash-free',name:'安和桥/MINIMAX m3.1-flash-free'}]},
 {id:'openai',name:'OpenAI',models:[{id:'gpt-6-astra',name:'GPT-6 Astra',reasoning:{defaultEffort:'medium',efforts:[{id:'low',name:'Low'},{id:'medium',name:'Medium'},{id:'high',name:'High'},{id:'xhigh',name:'Extra high'}]}},{id:'gpt-5.2',name:'GPT-5.2',reasoning:{defaultEffort:'low',efforts:[{id:'low',name:'Low'},{id:'high',name:'High'}]}}]}
]};
let root,host,directory,options,calls,waiting=[],loadWaiting=[];
function store(value){const listeners=new Set();let state=value;return {getSnapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},patch:patch=>{state={...state,...patch};listeners.forEach(fn=>fn());}};}
function render(){const source=directory,opts=options;root.render(React.createElement(ModelPicker,{directory:source,locked:!!opts.locked,available:opts.available!==false,getLocale:()=>opts.locale??'zh',
 t:(key,params={})=>(dictionaries[opts.locale??'zh'][key]??key).replace(/\\{(\\w+)\\}/g,(_,name)=>String(params[name]??'')),
 load:()=>{calls.loads++;if(opts.deferLoad)return new Promise((resolve,reject)=>loadWaiting.push(reject));if(opts.retry&&calls.loads>1)source.patch({failures:[],error:null,status:'ready'});return Promise.resolve();},
 select:selection=>{calls.selections.push(selection);const result=opts.fail?{ok:false,error:{code:'session/writer-held'}}:{ok:true};const finish=()=>{if(result.ok&&opts.apply!==false)source.patch({current:selection,pending:null,status:'ready'});return result;};if(opts.defer)return new Promise(resolve=>waiting.push(()=>resolve(finish())));return Promise.resolve(finish());}
}));}
function mount(opts={}){root?.unmount();host?.remove();options=opts;calls={loads:0,selections:[]};waiting=[];directory=store({...structuredClone(base),...opts.snapshot});host=document.createElement('div');host.style.cssText='position:fixed;bottom:24px;left:24px;right:24px;min-height:58px;padding:6px 12px;display:flex;align-items:center;justify-content:flex-end;border:1px solid var(--dsw-alias-border-l1);border-radius:16px;background:var(--dsw-alias-bg-layer-1)';document.body.append(host);root=createRoot(host);render();}
window.fixture={mount,patch:value=>directory.patch(value),props:value=>{options={...options,...value};render();},calls:()=>calls,resolve:()=>waiting.shift()?.(),rejectLoad:()=>loadWaiting.shift()?.(Error('old load failed')),state:()=>directory.getSnapshot(),swap:()=>{directory=store({...structuredClone(base),current:{provider:'opencode-cpa',model:'安和桥/grok-4.7'}});render();},unmount:()=>{root?.unmount();host?.remove();root=null;host=null;},base};mount();
`;
export function fixtureBundle(){return buildSync({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'picker-fixture.js'},bundle:true,write:false,format:'iife',platform:'browser'}).outputFiles[0].text;}
export async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
export async function prepare(page,viewport={width:900,height:850}){await page.setViewportSize(viewport);await page.goto('about:blank');await page.addScriptTag({content:fixtureBundle()});await settle(page);}
export async function runRegression(page){
 await prepare(page);let cases=0;
 const reset=async opts=>{await page.evaluate(o=>window.fixture.mount(o),opts??{});await settle(page);};
 const open=async()=>{await page.locator('.lpa-model-trigger').click();await settle(page);};
 const count=async()=>page.evaluate(()=>window.fixture.calls().selections.length);
 const last=async()=>page.evaluate(()=>window.fixture.calls().selections.at(-1));
 const range=()=>page.locator('input[type=range]');
 const current=()=>page.locator('[data-model-id="gpt-6-astra"]');
 const drag=async(fraction,finish=true)=>{const b=await range().boundingBox();await page.mouse.move(b.x+b.width*2/3,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+12+(b.width-24)*fraction,b.y+b.height/2,{steps:8});if(finish)await page.mouse.up();await settle(page);};
 await open();assert.equal(await page.locator('.lpa-model-group').count(),3);assert.equal(await page.locator('.lpa-model-option').count(),8);assert.equal(await page.locator('.lpa-model-submenu').count(),0);assert.ok(await page.locator('.lpa-model-desc').count()>3);cases++;
 const bounds=await page.locator('.lpa-model-menu').boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=900&&bounds.y+bounds.height<=850);cases++;
 await current().click();assert.equal(await count(),0);assert.equal(await page.locator('.lpa-model-menu').count(),0);cases++;
 await open();await page.locator('[data-model-id="gpt-5.2"]').click();await settle(page);assert.deepEqual(await last(),{provider:'openai',model:'gpt-5.2',reasoningEffort:'high'});cases++;
 await reset();await open();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await settle(page);assert.equal(await count(),1);assert.equal((await last()).model,'mimo-v2.6-pro');cases++;
 await reset({snapshot:{current:{provider:'openai',model:'gpt-6-astra',reasoningEffort:'xhigh'}}});await open();await page.locator('[data-model-id="gpt-5.2"]').click();await settle(page);
 assert.deepEqual(await last(),{provider:'openai',model:'gpt-5.2'},'a level the new model does not advertise is not sent');
 assert.equal(await page.locator('.lpa-model-menu').count(),0);cases++;
 await reset();await open();await page.keyboard.press('Tab');assert.equal(await range().evaluate(n=>n===document.activeElement),true);await page.keyboard.press('ArrowLeft');await settle(page);assert.equal(await count(),1);assert.equal((await last()).reasoningEffort,'medium');cases++;
 await reset();await open();await drag(0,false);assert.equal(await count(),0);await page.mouse.up();await settle(page);assert.equal(await count(),1);assert.equal((await last()).reasoningEffort,'low');cases++;
 await reset();await open();await drag(2/3);assert.equal(await count(),0);cases++;
 await reset();await open();await drag(0,false);await range().dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();await settle(page);assert.equal(await count(),0);cases++;
 await reset();await open();await drag(0,false);await page.evaluate(()=>{const s=window.fixture.state();const groups=structuredClone(s.groups);groups[2].models[0].reasoning.efforts=[...groups[2].models[0].reasoning.efforts,{id:'provider-custom',name:'Provider custom'}].reverse();window.fixture.patch({groups});});await settle(page);await page.mouse.move(800,400,{steps:5});await page.mouse.up();await settle(page);assert.equal(await count(),0);cases++;
 await reset();await open();await drag(0,false);await page.evaluate(()=>window.fixture.patch({current:{provider:'openai',model:'gpt-5.2',reasoningEffort:'high'}}));await settle(page);await page.mouse.up();assert.equal(await count(),0);cases++;
 await reset({fail:true});await open();await page.locator('[data-model-id="gpt-5.2"]').click();await settle(page);assert.equal(await page.locator('.lpa-model-menu').count(),1);assert.match(await page.locator('[role=alert]').textContent(),/其他 DSH/);cases++;
 await reset({snapshot:{failures:[{id:'bad',name:'失败供应商',message:'test offline'}],error:'test network'},retry:true});await open();assert.match(await page.locator('.lpa-model-failures').textContent(),/test offline/);assert.equal(await page.locator('.lpa-model-option').count(),8);await page.locator('.lpa-model-retry').click();await settle(page);assert.equal(await page.locator('.lpa-model-failures').count(),0);cases++;
 await reset({locked:true});assert.equal(await page.locator('.lpa-model-trigger').isDisabled(),true);cases++;
 await reset();await open();await page.evaluate(()=>window.fixture.props({locked:true}));await settle(page);assert.equal(await page.locator('.lpa-model-menu').count(),0);assert.equal(await count(),0);cases++;
 await reset({available:false});assert.equal(await page.locator('.lpa-model-trigger').count(),0);cases++;
 await reset({defer:true});await open();await page.locator('[data-model-id="gpt-5.2"]').click();await settle(page);assert.equal(await range().isDisabled(),true);assert.equal(await page.locator('.lpa-model-option:enabled').count(),0);await page.locator('#outside').click();await page.evaluate(()=>window.fixture.resolve());await settle(page);assert.equal(await page.locator('#outside').evaluate(n=>n===document.activeElement),true);cases++;
 await reset({defer:true});await open();await page.locator('[data-model-id="gpt-5.2"]').click();await settle(page);await page.evaluate(()=>window.fixture.swap());await settle(page);await page.evaluate(()=>window.fixture.resolve());await settle(page);assert.match(await page.locator('.lpa-model-trigger').textContent(),/Grok/);assert.equal(await page.locator('.lpa-model-menu').count(),0);cases++;
 await reset({snapshot:{current:{provider:'openai',model:'gpt-6-astra',reasoningEffort:'unknown-custom'}}});await open();assert.match(await range().getAttribute('aria-valuetext'),/不在可选/);cases++;
 await reset({snapshot:{current:{provider:'opencode-cpa',model:'安和桥/grok-4.7'}}});await open();assert.equal(await range().count(),0);cases++;
 await reset();await page.evaluate(()=>{const groups=structuredClone(window.fixture.state().groups);groups[2].models[0].reasoning={defaultEffort:'only',efforts:[{id:'only',name:'Only'}]};window.fixture.patch({groups,current:{provider:'openai',model:'gpt-6-astra'}});});await open();assert.equal(await range().isDisabled(),true);cases++;
 await reset({deferLoad:true});await open();await page.evaluate(()=>window.fixture.swap());await settle(page);await open();await page.evaluate(()=>window.fixture.rejectLoad());await settle(page);assert.equal(await page.locator('[role=alert]').count(),0);cases++;
 await reset({fail:true});await open();await drag(0);assert.equal(await count(),1);assert.equal(await range().inputValue(),'2');assert.match(await page.locator('[role=alert]').textContent(),/其他 DSH/);cases++;
 await reset();await open();await drag(0,false);await page.evaluate(()=>window.fixture.props({locked:true}));await settle(page);await page.mouse.up();assert.equal(await count(),0);assert.equal(await page.locator('.lpa-model-menu').count(),0);cases++;
 await reset();await open();await range().focus();await page.keyboard.down('ArrowLeft');assert.equal(await count(),0);await page.keyboard.press('Escape');await page.keyboard.up('ArrowLeft');assert.equal(await count(),0);assert.equal(await page.locator('.lpa-model-menu').count(),0);cases++;
 await reset({defer:true});await open();await range().focus();await page.keyboard.press('ArrowLeft');await settle(page);assert.equal(await range().isDisabled(),true);await page.evaluate(()=>window.fixture.resolve());await settle(page);assert.equal(await range().evaluate(n=>n===document.activeElement),true);await page.keyboard.press('ArrowRight');await settle(page);assert.equal(await count(),2);await page.evaluate(()=>window.fixture.resolve());await settle(page);await page.keyboard.press('Escape');assert.equal(await page.locator('.lpa-model-menu').count(),0);cases++;
 await reset({defer:true,fail:true});await open();await page.keyboard.press('Home');await page.keyboard.press('Enter');await settle(page);await page.evaluate(()=>window.fixture.resolve());await settle(page);assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('lpa-model-option')),true);await page.keyboard.press('Escape');assert.equal(await page.locator('.lpa-model-menu').count(),0);cases++;
 await reset({snapshot:{failures:[{id:'bad',message:'offline'}]},retry:true});await open();await page.keyboard.press('Tab');assert.equal(await page.locator('.lpa-model-retry').evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await range().evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Shift+Tab');assert.equal(await page.locator('.lpa-model-retry').evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Enter');await settle(page);assert.equal(await page.locator('.lpa-model-failures').count(),0);cases++;
 await reset({snapshot:{current:{provider:'opencode-cpa',model:'安和桥/grok-4.7'},failures:[{id:'bad',message:'offline'}]},retry:true});await open();await page.keyboard.press('Tab');assert.equal(await page.locator('.lpa-model-retry').evaluate(n=>n===document.activeElement),true);await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('lpa-model-option')),true);cases++;
 for(const width of [320,480,900]){await reset();await page.setViewportSize({width,height:700});await open();const b=await page.locator('.lpa-model-menu').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width&&b.y>=0&&b.y+b.height<=700);await page.keyboard.press('Escape');assert.equal(await page.locator('.lpa-model-menu').count(),0);cases++;}
 await page.setViewportSize({width:900,height:850});
 const PIN_KEY='local-prompt-assist:model-pinned-providers';
 const storedPins=()=>page.evaluate(key=>JSON.parse(window.__pinStorage.getItem(key)??'[]'),PIN_KEY);
 await page.evaluate(key=>{const store=new Map();window.__pinStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};Object.defineProperty(window,'localStorage',{value:window.__pinStorage,configurable:true});window.__pinStorage.setItem(key,JSON.stringify(['xiaomi-token-plan-cn']));},PIN_KEY);
 await reset();await open();
 assert.equal(await page.locator('.lpa-model-group').count(),1);
 assert.equal(await page.locator('.lpa-model-option').count(),2);
 assert.equal(await page.locator('.lpa-model-provider-row').count(),1);
 await page.setViewportSize({width:1900,height:900});await settle(page);
 const row=page.locator('.lpa-model-provider-row[data-provider-id="other-models"]');
 assert.match(await row.textContent(),/其余模型/);assert.match(await row.textContent(),/6/);assert.match(await row.textContent(),/›/);
 assert.equal(await page.locator('.lpa-model-provider-row--current').count(),1);cases++;
 const flyout=page.locator('.lpa-model-flyout');
 assert.equal(await flyout.count(),0);
 await row.hover();await settle(page);
 assert.equal(await flyout.count(),1);
 const placed=await flyout.boundingBox(), rowBox=await row.boundingBox();
 assert.ok(placed.x+placed.width<=rowBox.x||placed.x>=rowBox.x+rowBox.width,'flyout sits beside the row, not on top of it');
 assert.ok(placed.x+placed.width<=1900&&placed.y>=0&&placed.y+placed.height<=900,'flyout stays in the viewport');
 assert.equal(await page.locator('.lpa-model-other-provider').count(),2);
 assert.equal(await page.locator('.lpa-model-other-provider--divided').count(),1);
 assert.ok(await page.locator('.lpa-model-option').count()>=6);cases++;
 await page.locator('.lpa-model-pin[data-provider-id="openai"]').click();await settle(page);
 assert.deepEqual(await storedPins(),['xiaomi-token-plan-cn','openai']);
 assert.equal(await page.locator('.lpa-model-group').count(),2);
 assert.match(await page.locator('.lpa-model-provider-row[data-provider-id="other-models"]').textContent(),/4/);cases++;
 await reset();await open();await page.setViewportSize({width:1900,height:900});await settle(page);
 await row.hover();await settle(page);
 await page.locator('.lpa-model-pin[data-provider-id="openai"]').click();await settle(page);
 assert.deepEqual(await storedPins(),['xiaomi-token-plan-cn']);cases++;
 await reset();await open();await page.setViewportSize({width:1900,height:900});await settle(page);
 await row.hover();await settle(page);
 await page.locator('.lpa-model-option[data-model-id="gpt-5.2"]').click();await settle(page);
 assert.deepEqual(await last(),{provider:'openai',model:'gpt-5.2',reasoningEffort:'high'});
 assert.equal(await page.locator('.lpa-model-menu').count(),0);
 assert.equal(await flyout.count(),0);cases++;
 await open();await row.hover();await settle(page);
 await page.keyboard.press('Escape');await settle(page);
 assert.equal(await page.locator('.lpa-model-menu').count(),0);cases++;
 await open();await row.focus();await page.keyboard.press('ArrowRight');await settle(page);
 assert.equal(await page.locator('.lpa-model-flyout').count(),1);cases++;
 await reset();await open();await page.setViewportSize({width:1900,height:900});await settle(page);
 await row.hover();await settle(page);
 await page.evaluate(()=>{window.fixture.patch({groups:window.fixture.state().groups.filter(g=>g.id==='openai')});});
 await settle(page);
 assert.equal(await page.locator('.lpa-model-flyout').count(),0);
 assert.equal(await page.locator('.lpa-model-menu').count(),1);cases++;
 await reset();
 await page.evaluate(()=>{const groups=structuredClone(window.fixture.state().groups);const gpt=groups.find(g=>g.id==='openai').models.find(m=>m.id==='gpt-6-astra');gpt.reasoning={defaultEffort:'max',efforts:[{id:'max',name:'Max'},{id:'xhigh',name:'Extra high'},{id:'high',name:'High'},{id:'medium',name:'Medium'},{id:'low',name:'Low'}]};window.fixture.patch({groups,current:{provider:'openai',model:'gpt-6-astra',reasoningEffort:'low'}});});
 await open();
 assert.equal(await range().inputValue(),'0');
 assert.equal(await range().getAttribute('aria-valuetext'),'低');
 await drag(1);
 assert.equal((await last()).reasoningEffort,'max');
 assert.equal(await range().inputValue(),'4');
 assert.equal(await range().getAttribute('aria-valuetext'),'最高');cases++;
 // The trigger effort is locale-agnostic: the same reasoning model shows a readable
 // level in zh/en and light/dark alike, and models without reasoning metadata hide
 // the segment in every combination (mirroring the native selector).
 const readout=()=>page.evaluate(()=>{const effort=document.querySelector('.lpa-model-trigger-effort');if(!effort)return null;const style=getComputedStyle(effort);let node=effort.parentElement;while(node&&node!==document.documentElement){const paint=getComputedStyle(node).backgroundColor;if(paint&&paint!=='transparent'&&!paint.includes('0, 0, 0, 0'))break;node=node.parentElement;}const parse=value=>{const m=value.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(/[,]\s*|\s*\/\s*/).map(Number);return [p[0],p[1],p[2]];};const channel=value=>{const v=value/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};const lum=rgb=>rgb?0.2126*channel(rgb[0])+0.7152*channel(rgb[1])+0.0722*channel(rgb[2]):null;const fg=parse(style.color),bg=parse(node&&node!==document.documentElement?getComputedStyle(node).backgroundColor:null);const a=lum(fg),b=lum(bg);return {text:effort.textContent,display:style.display,color:style.color,contrast:a!=null&&b!=null?Number(((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toFixed(2)):null};});
 await reset({locale:'en'});await page.evaluate(()=>document.body.classList.add('dark'));await settle(page);
 const enDark=await readout();
 assert.equal(enDark.text,'High');assert.equal(enDark.display,'block');
 assert.ok(enDark.contrast>=4.5,'English dark-theme effort must stay readable: '+JSON.stringify(enDark));cases++;
 await page.evaluate(()=>document.body.classList.remove('dark'));await settle(page);
 const enLight=await readout();
 assert.equal(enLight.text,'High');assert.equal(enLight.display,'block');cases++;
 await reset();await settle(page);
 const zhLight=await readout();
 assert.equal(zhLight.text,'高');assert.equal(zhLight.display,'block');
 assert.equal(zhLight.color,enLight.color,'theme, not language, decides the effort color');cases++;
 await page.evaluate(()=>document.body.classList.add('dark'));await settle(page);
 const zhDark=await readout();
 assert.equal(zhDark.text,'高');assert.equal(zhDark.display,'block');
 assert.equal(zhDark.color,enDark.color,'dark-theme effort color is locale-independent');
 assert.ok(zhDark.contrast>=4.5,'Chinese dark-theme effort must stay readable: '+JSON.stringify(zhDark));cases++;
 await page.evaluate(()=>document.body.classList.remove('dark'));
 const plain={snapshot:{current:{provider:'opencode-cpa',model:'安和桥/deepseek-v4.1-flash-free'}}};
 await reset(plain);await settle(page);assert.equal(await page.locator('.lpa-model-trigger-effort').count(),0);cases++;
 await reset({...plain,locale:'en'});await page.evaluate(()=>document.body.classList.add('dark'));await settle(page);
 assert.equal(await page.locator('.lpa-model-trigger-effort').count(),0);
 assert.match(await page.locator('.lpa-model-trigger').textContent(),/deepseek v4\.1-flash-free/);
 await page.evaluate(()=>document.body.classList.remove('dark'));await settle(page);cases++;
 await page.evaluate(key=>window.__pinStorage.removeItem(key),PIN_KEY);
 await reset();await open();await page.evaluate(()=>window.fixture.unmount());await settle(page);assert.equal(await page.locator('.lpa-model-menu').count(),0);cases++;
 // A committed effort level must not move the popup: the target stops immediately and the menu
 // keeps its geometry while the deferred host acknowledgement arrives.
 await reset({defer:true});await open();
 const menuBox=async()=>page.evaluate(()=>{const r=document.querySelector('.lpa-model-menu').getBoundingClientRect();return {top:Math.round(r.top),left:Math.round(r.left)};});
 const boxBefore=await menuBox(),rangeBox=await range().boundingBox();
 await page.mouse.move(rangeBox.x+rangeBox.width*0.3,rangeBox.y+rangeBox.height/2);
 await page.mouse.down();
 await page.mouse.move(rangeBox.x+rangeBox.width-6,rangeBox.y+rangeBox.height/2,{steps:8});
 await page.mouse.up();await settle(page);
 const targetLevel=await range().inputValue();
 assert.equal(targetLevel,'3','The slider must stop at the dragged level');cases++;
 assert.deepEqual(await menuBox(),boxBefore,'The popup must not jump while the host acknowledges');cases++;
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('.lpa-model-option')).opacity),'1','Rows must not dim while the effort is acknowledged');cases++;
 await page.evaluate(()=>window.fixture.resolve());await settle(page);
 assert.equal(await range().inputValue(),targetLevel,'The slider must keep the committed level');cases++;
 assert.deepEqual(await menuBox(),boxBefore,'The popup must not move after the acknowledgement');cases++;
 return {passed:true,cases,modelCalls:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('Model picker fixture compiled:',fixtureBundle().length,'bytes; run scripts/run-model-picker-browser.mjs for real browser checks.');
