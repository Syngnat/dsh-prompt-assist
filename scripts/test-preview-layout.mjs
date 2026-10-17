// Run only against an isolated DSH Web session with a fresh, unsent conversation.
// Uses real Preview markup and native DSH layout, with synthetic text and no model calls.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {css} from '../assist/client/style.js';
import {dictionaries} from '../assist/client/messages.js';
const require=createRequire(new URL('../package.json',import.meta.url));
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{buildSync}=require('esbuild');
const built=buildSync({entryPoints:[fileURLToPath(new URL('../assist/client/preview.js',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react']});
const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);
function fixture(name,text,options={}){
 const value={sessionId:'layout-fixture',feature:options.feature??'enhance',streaming:!!options.streaming,snapshot:{structured:false},original:'Synthetic original text\n'.repeat(30),text,route:{provider:'fixture',model:'offline'},timing:{ttftMs:10,totalMs:50}};
 return {name,open:!!options.open,html:renderToStaticMarkup(React.createElement(module.exports.Preview,{runtime:{sessionId:'layout-fixture',allowed:true,busy:false,dirty:false,result:{preview:value}},actions:{},t:key=>dictionaries.zh[key]??key,onApplied(){}}))};
}
const fixtures=[fixture('short','请读取指定文件，并总结其内容。'),fixture('long','Synthetic line for layout checking.\n'.repeat(80)),fixture('long-word','LongUnbrokenText'.repeat(150)),fixture('streaming','Streaming line\n'.repeat(40),{streaming:true}),fixture('details','Result\n'.repeat(40),{open:true}),fixture('suggestion','Suggestion\n'.repeat(40),{feature:'suggest'}),
 {name:'pending',modifier:' lpa-inline--pending',html:'<div class="lpa-row lpa-pending"><span>正在生成…</span><button class="lpa-button">取消</button></div>'},
 {name:'undo',modifier:' lpa-inline--undo',html:'<div class="lpa-undo-actions"><button class="lpa-button">撤销本次应用</button></div>'}];
async function browserProbe(page,payload){
 const previous=page.viewportSize();const results=[],failures=[];
 try{
  for(const viewport of [{width:1280,height:720},{width:1024,height:576},{width:853,height:480},{width:640,height:360},{width:480,height:640}]){
   await page.setViewportSize(viewport);
   for(const fixture of payload.fixtures){
    const result=await page.evaluate(async ({css,fixture})=>{
     const stack=document.querySelector('[class*="_composerStack"]');
     if(!stack?.className.includes('_composerHero'))throw Error('Expected a real, isolated DSH first-conversation composer; do not run against a user conversation.');
     document.querySelector('[data-layout-probe]')?.remove();
     document.querySelector('[data-layout-css]')?.remove();
     const sheet=document.createElement('style');sheet.dataset.layoutCss='';sheet.textContent=css;document.body.append(sheet);
     const panel=document.createElement('section');panel.className='lpa lpa-inline'+(fixture.modifier??'');panel.dataset.layoutProbe='';panel.innerHTML='<style>'+css+'</style>'+fixture.html;
     stack.insertBefore(panel,stack.lastElementChild);
     if(fixture.open)panel.querySelectorAll('details').forEach(item=>item.open=true);
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     const bounds=panel.getBoundingClientRect();
     const actions=panel.querySelector('.lpa-preview-actions,.lpa-pending,.lpa-undo-actions').getBoundingClientRect();
     const body=panel.querySelector('.lpa-result-text');
     const result={name:fixture.name,viewport:[innerWidth,innerHeight],height:bounds.height,layout:getComputedStyle(panel).display,scrollHeight:panel.scrollHeight,actionsInside:actions.top>=bounds.top&&actions.bottom<=bounds.bottom-1,horizontalOverflow:panel.scrollWidth>panel.clientWidth+1,bodyHeight:body?.getBoundingClientRect().height??null,bodyScrollable:body?body.scrollHeight>body.clientHeight+1:false};
     const button=panel.querySelector('.lpa-preview-actions button:last-child,.lpa-pending button,.lpa-undo-actions button');
     button.scrollIntoView({block:'nearest'});
     const br=button.getBoundingClientRect(),hit=document.elementFromPoint(br.left+br.width/2,br.top+br.height/2);
     result.actionReachable=!!hit&&(hit===button||button.contains(hit));
     const input=stack.lastElementChild.querySelector('[class*="_card"]');
     input.scrollIntoView({block:'nearest'});const ir=input.getBoundingClientRect();
     result.inputReachable=ir.bottom<=innerHeight+1&&ir.top>=-1;
     return result;
    },{css:payload.css,fixture});
    results.push(result);
    if(!result.actionsInside||result.horizontalOverflow||!result.actionReachable||!result.inputReachable||(result.bodyHeight!==null&&result.bodyHeight<15))failures.push(result);
   }
  }
 }finally{await page.evaluate(()=>{document.querySelector('[data-layout-probe]')?.remove();document.querySelector('[data-layout-css]')?.remove();});if(previous)await page.setViewportSize(previous);}
 return {passed:!failures.length,cases:results.length,failures,results};
}
const out='output/playwright/preview-layout-regression.cjs';mkdirSync('output/playwright',{recursive:true});
writeFileSync(out,'async(page)=>('+browserProbe.toString()+')(page,'+JSON.stringify({css,fixtures})+')');
const index=process.argv.indexOf('--session');
if(index<0){console.log('Generated '+out+'; run with --session <isolated-playwright-cli-session> to assert geometry.');process.exit(0);}
const session=process.argv[index+1];if(!/^[a-zA-Z0-9_-]+$/.test(session??''))throw Error('Invalid isolated browser session name');
const command='npx --yes --package @playwright/cli playwright-cli -s='+session+' run-code --filename '+out+' --raw';
const text=process.platform==='win32'?execFileSync('cmd.exe',['/d','/s','/c',command],{encoding:'utf8',timeout:120000}):execFileSync('npx',['--yes','--package','@playwright/cli','playwright-cli','-s='+session,'run-code','--filename',out,'--raw'],{encoding:'utf8',timeout:120000});
const report=JSON.parse(text);writeFileSync('output/playwright/preview-layout-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({passed:report.passed,cases:report.cases,failures:report.failures},null,2));if(!report.passed)process.exitCode=1;
