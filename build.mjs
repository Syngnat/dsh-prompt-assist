import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('./package.json', import.meta.url));
const { build } = require('esbuild');
const root = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('package.json', import.meta.url), 'utf8'));
const host = 'host-v' + manifest.version + '.js';
await build({absWorkingDir:root,entryPoints:['host-source.js'],bundle:true,platform:'node',target:'node22',format:'esm',outfile:host,external:['node:*'],minify:false});
await build({absWorkingDir:root,entryPoints:['client-entry.js'],bundle:true,platform:'browser',target:'es2022',format:'cjs',outfile:'client-runtime.js',external:['react','react-dom','react-dom/client','@deepseek-ai/*'],minify:false,banner:{js:'window.__ModuleLoader__.load({id:"@local/dsh-openai-fast",factory(require){var module={exports:{}};var exports=module.exports;'},footer:{js:'return module.exports;}});'}});
await writeFile(new URL('client.js',import.meta.url),await readFile(new URL('client-runtime.js',import.meta.url)));

// esbuild labels every module with its path relative to this checkout. A dependency tree outside it
// (for example a junction to a sibling repository) leaks that path into the artifact and makes the
// committed bytes depend on the machine that built them, so a clean CI rebuild never matches.
const foreign = /\.\.(?:[\\/][^\s"'`]*)?[\\/]node_modules[\\/]/u;
for (const name of [host, 'client-runtime.js']) {
  const text = await readFile(new URL(name, import.meta.url), 'utf8');
  const match = text.match(foreign);
  if (match) throw new Error('Build is not reproducible: ' + name + ' embeds a dependency path outside this checkout (' + match[0] + '). Install dependencies in this repository, for example pnpm install --frozen-lockfile --ignore-scripts, then rebuild.');
}
console.log('Built '+host+' and both Client artifacts');
