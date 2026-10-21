import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const artifacts = [manifest.exports['.'].slice(2), 'client.js', 'client-runtime.js'];

/**
 * Artifacts are committed, so their bytes must not depend on the machine that built them. esbuild labels
 * every module with its path relative to the checkout; a dependency tree outside it (a junction to a
 * sibling repository, for example) leaks that path into the file and makes every clean CI rebuild differ.
 */
const foreign = /\.\.(?:[\\/][^\s"'`]*)?[\\/]node_modules[\\/]/u;

for (const name of artifacts) {
  test('committed artifact ' + name + ' embeds no path outside this checkout', async () => {
    const text = await readFile(new URL(name, root), 'utf8');
    const match = text.match(foreign);
    assert.equal(match, null, 'artifact references ' + (match && match[0]) + '; run build.mjs after installing dependencies inside this repository');
    assert.ok(text.length > 0);
  });
}

test('versioned host artifact is the one package.json exports', async () => {
  const host = manifest.exports['.'];
  assert.equal(host, './host-v' + manifest.version + '.js');
  assert.ok(manifest.files.includes(host.slice(2)), 'the published file list must carry the exported host artifact');
  const text = await readFile(new URL(host, root), 'utf8');
  assert.ok(text.includes('"' + manifest.version + '"'), 'the host artifact must embed the package version');
});
