// Actual ZCode React picker with a synthetic catalog: no profile or model requests.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {prepare,settle} from './test-model-picker-layout.mjs';

const reasoning={defaultEffort:'high',efforts:[{id:'low',name:'Low'},{id:'high',name:'High'}]};
const initial={provider:'magpie',model:'cpa/gpt-6.1-sol',reasoningEffort:'high'};
const snapshot={current:initial,groups:[
 {id:'deepseek-account',name:'DeepSeek 账户',models:[{id:'deepseek-flash',name:'DeepSeek Flash'}]},
 {id:'magpie',name:'Magpie',models:[{id:'cpa/gpt-6.1-sol',name:'Magpie Sol',reasoning},{id:'cpa/glm-5.3-flash',name:'Magpie GLM'}]},
 {id:'magpie-responses',name:'Magpie · Responses',models:[{id:'cpa/gpt-6.1-sol',name:'Responses Sol',reasoning},{id:'cpa/gpt-6-astra',name:'Responses Astra',reasoning}]},
]};

export async function runZcodeProviderRegression(page){
 await prepare(page,{width:900,height:850});
 await page.evaluate(()=>{
  const values=new Map([['lpa_model_picker_style','zcode']]);
  Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}});
 });
 let cases=0;
 const open=async()=>{await page.locator('.lpa-model-trigger').click();await settle(page);};
 const header=()=>page.locator('.lpa-zt-provider-row');
 const name=()=>header().locator('.lpa-zt-provider-name').textContent();
 const calls=()=>page.evaluate(()=>window.fixture.calls().selections);
 const rows=()=>page.locator('.lpa-model-option');
 const choose=async id=>{
  await header().click();await settle(page);
  await page.locator('.lpa-zt-provider-option[data-provider-id="'+id+'"]').click();await settle(page);
 };
 for(const variant of [{locale:'zh',dark:false,width:900},{locale:'en',dark:true,width:900},{locale:'zh',dark:true,width:360},{locale:'en',dark:false,width:360}]){
  await page.setViewportSize({width:variant.width,height:850});
  await page.evaluate(({variant,snapshot})=>{document.body.classList.toggle('dark',variant.dark);window.fixture.mount({locale:variant.locale,snapshot});},{variant,snapshot});
  await settle(page);await open();
  assert.equal(await name(),'Magpie');
  await choose('magpie-responses');
  if(variant.locale==='zh'&&!variant.dark){mkdirSync('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/zcode-provider-navigation.png'});}
  assert.equal(await name(),'Magpie · Responses','The provider header must follow the clicked provider, not the selected model');
  assert.deepEqual(await rows().evaluateAll(nodes=>nodes.map(node=>node.dataset.providerId)),['magpie-responses','magpie-responses']);
  assert.deepEqual(await rows().locator('.lpa-model-name').allTextContents(),['Responses Astra','Responses Sol']);
  assert.deepEqual(await calls(),[],'Provider navigation must not auto-select any model');
  assert.deepEqual(await page.evaluate(()=>window.fixture.state().current),initial);
  assert.equal(await page.locator('input[type=range]').count(),0,'Do not expose the old provider reasoning control while browsing a different provider');
  await header().click();await settle(page);
  assert.equal(await page.locator('.lpa-zt-provider-row').count(),0,'The provider list must not repeat the browsed provider as a header row');
  const placed=await page.evaluate(()=>{
   const back=document.querySelector('.lpa-zt-back-row').getBoundingClientRect();
   const options=[...document.querySelectorAll('.lpa-zt-provider-option')].map(node=>node.getBoundingClientRect());
   return {backTop:back.top,bottom:Math.max(...options.map(rect=>rect.bottom))};
  });
  assert.ok(placed.backTop>=placed.bottom-1,'Back must sit below the provider list');
  await page.locator('.lpa-zt-back-row').click();await settle(page);
  assert.equal(await name(),'Magpie · Responses','Back returns to the browsed provider');cases++;

  await header().click();await settle(page);
  assert.equal(await page.locator('.lpa-zt-provider-option[data-provider-id="magpie"]').getAttribute('aria-checked'),'true');
  assert.equal(await page.locator('.lpa-zt-provider-option[data-provider-id="magpie-responses"]').count(),0,'The browsed provider already owns the header and must not be listed again');
  await page.locator('.lpa-zt-back-row').click();await settle(page);
  assert.equal(await name(),'Magpie · Responses','Back returns to the browsed provider, not the active route');cases++;

  // A shared model id must still switch the provider route, not be mistaken for the current model.
  await page.locator('.lpa-model-option[data-model-id="cpa/gpt-6.1-sol"]').click();await settle(page);
  assert.deepEqual((await calls()).at(-1),{provider:'magpie-responses',model:'cpa/gpt-6.1-sol',reasoningEffort:'high'});
  assert.equal(await page.locator('.lpa-model-menu').count(),0);await open();cases++;

  await header().focus();await page.keyboard.press('Enter');await settle(page);
  await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');await settle(page);
  assert.equal(await name(),'Magpie','Keyboard provider navigation must change the browsed provider without committing a route');
  assert.equal((await calls()).length,1);
  await page.keyboard.press('Enter');await settle(page);
  await page.keyboard.press('End');await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');await settle(page);
  assert.equal(await name(),'Magpie · Responses');
  assert.equal(await header().evaluate(node=>node===document.activeElement),true,'Keyboard drill-down restores focus to the provider header');
  await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await settle(page);
  assert.deepEqual((await calls()).at(-1),{provider:'magpie-responses',model:'cpa/gpt-6-astra',reasoningEffort:'high'});
  assert.equal(await page.locator('.lpa-model-menu').count(),0);cases++;

  await open();
  assert.equal(await name(),'Magpie · Responses');
  assert.equal(await page.locator('.lpa-model-option[aria-checked="true"]').getAttribute('data-model-id'),'cpa/gpt-6-astra');
  assert.equal(await page.locator('input[type=range]').count(),1);
  await choose('deepseek-account');
  assert.equal(await rows().count(),1);
  assert.equal(await rows().first().getAttribute('data-provider-id'),'deepseek-account');
  await page.locator('#outside').click();await settle(page);await open();
  assert.equal(await name(),'Magpie · Responses','Reopening resets browsing to the committed route');cases++;

  for(const prop of ['locked','available']){
   await choose('magpie');
   await page.evaluate(prop=>window.fixture.props({[prop]:prop==='locked'}),prop);await settle(page);
   assert.equal(await page.locator('.lpa-model-menu').count(),0);
   await page.evaluate(prop=>window.fixture.props({[prop]:prop!=='locked'}),prop);await settle(page);
   await open();
   assert.equal(await name(),'Magpie · Responses','A forced '+prop+' closure must reset provider browsing');
   assert.equal(await page.locator('input[type=range]').count(),1);cases++;
  }

  await choose('deepseek-account');
  // The header badge counts providers, not this provider's models: one model here, three providers.
  const badge=await header().locator('.lpa-zt-provider-count').textContent();
  assert.equal(/\d+/.exec(badge)[0],'3','The provider row must report the provider count, not the model count');
  assert.match(badge,/供应商|provider/);
  assert.equal(await page.locator('.lpa-zt-provider-option[data-provider-id="deepseek-account"]').count(),0,'The listed providers exclude the one shown above');
  await page.keyboard.press('ArrowDown');
  assert.equal(await rows().first().evaluate(node=>node===document.activeElement),true);
  await page.evaluate(()=>window.fixture.patch({groups:window.fixture.state().groups.filter(group=>group.id!=='deepseek-account')}));await settle(page);
  assert.equal(await name(),'Magpie · Responses','A removed browsed provider falls back to the committed route');
  assert.equal(await header().evaluate(node=>node===document.activeElement),true,'Catalog fallback restores keyboard focus to the provider header');
  assert.deepEqual(await rows().evaluateAll(nodes=>nodes.map(node=>node.dataset.providerId)),['magpie-responses','magpie-responses']);
  await page.keyboard.press('Escape');await settle(page);
  assert.equal(await page.locator('.lpa-model-menu').count(),0,'Escape still closes the picker after catalog fallback');await open();cases++;

  await choose('magpie');
  await page.evaluate(()=>window.fixture.swap());await settle(page);
  assert.equal(await page.locator('.lpa-model-menu').count(),0);
  await open();
  assert.equal(await name(),'opencode-cpa','Session switches must not retain another session browsing state');cases++;
  await page.locator('#outside').click();await settle(page);
 }
 return {passed:true,cases,variants:4,modelCalls:0};
}
