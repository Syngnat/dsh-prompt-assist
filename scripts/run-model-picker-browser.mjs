// Runs the generated about:blank model-picker fixture in a real Chromium.
// Uses the locally cached Playwright build; no network and no profile access.
import {createRequire} from 'node:module';
import {readdirSync,existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
function resolvePlaywright() {
  try { return require('playwright'); } catch {}
  const cache = join(process.env.LOCALAPPDATA ?? '', 'npm-cache', '_npx');
  if (!existsSync(cache)) throw new Error('Playwright is not installed and no local cache was found');
  for (const entry of readdirSync(cache)) {
    const candidate = join(cache, entry, 'node_modules', 'playwright');
    if (existsSync(candidate)) return require(candidate);
  }
  throw new Error('Playwright was not found in the local npm cache');
}
const {chromium} = resolvePlaywright();
const probePath = new URL('../output/playwright/model-picker-regression.cjs', import.meta.url);
const probeSource = readFileSync(fileURLToPath(probePath), 'utf8');
const probe = new Function('return (' + probeSource + ')')();
const browser = await chromium.launch({headless: true, channel: 'chrome'});
try {
  const page = await browser.newPage();
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
  page.on('console', message => { if (message.type() === 'error') console.error('CONSOLE:', message.text()); });
  const result = await probe(page);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) { console.error('Model picker fixture FAILED'); process.exitCode = 1; }
  else console.log('Model picker fixture passed: ' + result.cases + ' cases, no model calls.');
} finally {
  await browser.close();
}
