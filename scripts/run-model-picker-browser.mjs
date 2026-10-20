// Uses existing local Playwright and Chrome; never connects to the real DSH GUI.
import {createRequire} from 'node:module';
import {readdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {runRegression} from './test-model-picker-layout.mjs';
const require=createRequire(import.meta.url);
function playwright(){
 try{return require('playwright');}catch{}
 const cache=join(process.env.LOCALAPPDATA??'','npm-cache','_npx');
 if(existsSync(cache))for(const dir of readdirSync(cache)){const candidate=join(cache,dir,'node_modules','playwright');if(existsSync(candidate))return require(candidate);}
 throw Error('No local Playwright installation found; nothing was downloaded.');
}
export async function withBrowser(run){
 const {chromium}=playwright(),browser=await chromium.launch({headless:true,channel:'chrome'});
 const errors=[];let requests=0;
 try{
  const context=await browser.newContext({deviceScaleFactor:2});
  await context.route('**/*',route=>{requests++;return route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  const result=await run(page);
  assert.deepEqual(errors,[],'Browser console/page errors are test failures');
  assert.equal(requests,0,'The synthetic fixture must not request external resources');
  return result;
 }finally{await browser.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 console.log(JSON.stringify(await withBrowser(runRegression),null,2));
}
