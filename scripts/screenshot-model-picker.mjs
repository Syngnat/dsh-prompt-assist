// Genuine component screenshots with the same synthetic catalog as the regression.
import {mkdirSync} from 'node:fs';
import {withBrowser} from './run-model-picker-browser.mjs';
import {prepare,settle} from './test-model-picker-layout.mjs';
mkdirSync('output/playwright',{recursive:true});
await withBrowser(async page=>{
 await prepare(page,{width:460,height:700});
 await page.locator('.lpa-model-trigger').click();await settle(page);
 await page.screenshot({path:'output/playwright/model-picker-grouped.png'});
 const slider=await page.locator('.lpa-effort').boundingBox();
 await page.screenshot({path:'output/playwright/model-picker-slider.png',clip:{x:Math.max(0,slider.x-8),y:Math.max(0,slider.y-8),width:slider.width+16,height:slider.height+16}});
 await page.evaluate(()=>{document.body.classList.add('dark');document.body.setAttribute('data-ds-dark-theme','');});await settle(page);
 await page.screenshot({path:'output/playwright/model-picker-grouped-dark.png'});
 console.log('Captured grouped, slider and dark screenshots under output/playwright. Synthetic catalog; no profile or model requests.');
});
