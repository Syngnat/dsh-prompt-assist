// Records the real offline React picker in its ZCode style: menu open, provider drill-down,
// and the thought slider at its strongest level with flowing bubbles. Mock catalog only;
// never connects to the real DSH GUI. Importing this module writes nothing.
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {withBrowser} from './run-model-picker-browser.mjs';
import {prepare,settle} from './test-model-picker-layout.mjs';

const python=String.raw`C:\Users\yangguofeng\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe`;
const encoder=resolve(import.meta.dirname,'encode-zcode-picker-gif.py');
const outputDirectory=resolve('output/playwright');
const styleShim=() => {
  // about:blank has an opaque origin, so the real localStorage throws. The picker reads its
  // style preference from it; answer 'zcode' for that key and nothing for the pin store.
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => key === 'lpa_model_picker_style' ? 'zcode' : null,
      setItem: () => {},
      removeItem: () => {},
    },
  });
};

/** Captures the sequence while Chromium is open; returns the manifest path only. */
async function capture(){
  return withBrowser(async page => {
    await prepare(page, {width: 460, height: 720});
    await page.evaluate(styleShim);
    await page.evaluate(() => window.fixture.mount({locale: 'zh'}));
    await settle(page);
    await page.locator('.lpa-model-trigger').click();
    await settle(page);
    const menu = page.locator(".lpa-model-menu[data-style='zcode']");
    await menu.waitFor({state: 'visible'});
    if (await page.locator('.lpa-zt-divider').count() !== 2) throw Error('Expected two region dividers in the zcode menu');
    if (await page.locator('.lpa-zt-provider-row').count() !== 1) throw Error('Expected the zcode provider row');

    const wallOrigin = Date.now();
    const stamp = new Date(wallOrigin).toISOString().replace(/[:.]/g, '-');
    const framesDirectory = resolve(outputDirectory, 'zcode-picker-motion-frames', stamp);
    mkdirSync(framesDirectory, {recursive: true});
    const frames = [];
    let phase = 'menu open';
    const captureFrame = async () => {
      const buffer = await page.screenshot();
      const file = 'frame-' + String(frames.length).padStart(4, '0') + '.png';
      writeFileSync(resolve(framesDirectory, file), buffer);
      frames.push({file, phase, sha256: createHash('sha256').update(buffer).digest('hex'), capturedAtMs: Math.round((Date.now() - wallOrigin) * 1000) / 1000});
    };
    const hold = async (ms, interval = 90) => {
      const end = Date.now() + ms;
      do { await captureFrame(); await delay(interval); } while (Date.now() < end);
    };

    await hold(900);
    phase = 'provider drill-down';
    await page.locator('.lpa-zt-provider-row').click();
    await settle(page);
    if (await page.locator('.lpa-zt-back-row').count() !== 1) throw Error('Provider submenu did not open');
    await hold(1100);
    phase = 'submenu returns to models';
    await page.locator('.lpa-zt-provider-option').last().click();
    await settle(page);
    await hold(800);
    phase = 'apex shimmer';
    const slider = page.locator('.lpa-zt-input');
    const sliderBox = await slider.boundingBox();
    await page.mouse.move(sliderBox.x + sliderBox.width * 0.35, sliderBox.y + sliderBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(sliderBox.x + sliderBox.width - 6, sliderBox.y + sliderBox.height / 2, {steps: 10});
    await page.mouse.up();
    await settle(page);
    if (await page.locator('.lpa-effort.lpa-zt[data-max]').count() !== 1) throw Error('Slider did not reach the strongest level');
    if (await page.locator('.lpa-zt-bubble').count() !== 12) throw Error('Expected 12 flowing bubbles at the strongest level');
    await hold(4200, 55);

    const effort = await page.locator('.lpa-effort.lpa-zt').boundingBox();
    const distinct = new Set(frames.map(frame => frame.sha256)).size;
    if (frames.length < 40) throw Error('Too few frames: ' + frames.length);
    if (distinct < 21) throw Error('Frames are not visually distinct: ' + distinct);
    const manifestPath = resolve(framesDirectory, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({
      format: 'real-browser-png-sequence-v1', complete: true, createdAt: new Date(wallOrigin).toISOString(),
      browser: page.context().browser().version(), url: page.url(),
      viewport: {width: 460, height: 720},
      effortRect: {x: effort.x, y: effort.y, width: effort.width, height: effort.height},
      endAtMs: frames.at(-1).capturedAtMs,
      captureMethod: 'Chrome page screenshots of the real offline React picker in ZCode style; mock catalog; frames sampled at roughly 11-18fps.',
      note: 'Simulated model catalog, not the installed profile.',
      phases: ['menu open', 'provider drill-down', 'submenu returns to models', 'apex shimmer'],
      frames,
    }, null, 2) + '\n', 'utf8');
    return {manifestPath, captured: frames.length, distinct};
  });
}

function encode(manifestPath){
  const gif = resolve(outputDirectory, 'zcode-picker-motion.gif');
  const preview = resolve(outputDirectory, 'zcode-picker-motion-preview.png');
  const result = spawnSync(python, [encoder, manifestPath, '--output', gif, '--preview', preview], {encoding: 'utf8', windowsHide: true, timeout: 600000});
  if (result.status !== 0) throw Error('GIF encoding failed:\n' + (result.error?.message ?? '') + '\n' + (result.stderr ?? '') + (result.stdout ?? ''));
  return {gif, preview, summary: JSON.parse(result.stdout.trim())};
}

export async function record(){
  const captured = await capture();
  const encoded = encode(captured.manifestPath);
  return {...captured, manifest: relative(process.cwd(), captured.manifestPath).replaceAll('\\', '/'), ...encoded};
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.dirname, 'record-zcode-picker-motion.mjs')) {
  record().then(report => console.log(JSON.stringify({passed: true, ...report, modelCalls: 0}, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
