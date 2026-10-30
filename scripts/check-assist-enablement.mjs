import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openEnablement } from "../assist/enablement-store.js";
import { openProfileStore } from "../assist/profile-store.js";

const manifest = resolve(process.argv[2] ?? ".compat-runtime/node_modules/@deepseek-ai/dsh/package.json");
const sdk = JSON.parse(readFileSync(manifest, "utf8"));
const requireSdk = createRequire(realpathSync(manifest));
const load = specifier => import(pathToFileURL(requireSdk.resolve(specifier)).href);
const { Context } = await load("@deepseek-ai/cordis");
const { Storage } = await load("@deepseek-ai/dsh-storage");
const jsonBackend = await load("@deepseek-ai/dsh-storage-json");
const domainLayer = await load("@deepseek-ai/dsh-storage-domain");
const requireSchema = createRequire(requireSdk.resolve("@deepseek-ai/schemastery"));
const { z } = await import(pathToFileURL(requireSchema.resolve("zod")).href);
const repository = resolve(fileURLToPath(new URL("..", import.meta.url))), base = resolve(tmpdir());
function outsideRepository(path) {
  const part = relative(repository, path);
  assert.ok(part === ".." || part.startsWith(".." + sep) || isAbsolute(part), "fixture must remain outside the repository");
}
outsideRepository(base);
const prefix = "dsh-assist-enablement-", temporary = await mkdtemp(join(base, prefix));
const storageRoot = join(temporary, "shared-storage");
const profileA = join(temporary, "profiles", "配置 Alpha"), profileB = join(temporary, "profiles", "Beta");

/** Actual public Cordis/storage plugins; identities share one physical backend on purpose. */
async function withStorage(run) {
  const root = new Context(), stores = [];
  try {
    await root.plugin(Storage).await();
    await root.plugin(jsonBackend, { root: storageRoot }).await();
    await root.plugin(domainLayer, { backend: "json" }).await();
    assert.equal(typeof root.get("storageDomain")?.open, "function");
    const open = async (dir, controls = false) => {
      const profile = Object.freeze({ dir });
      const ctx = { get(name) {
        if (name === "profileContext") return profile;
        if (name === "storageDomain") return root.get(name);
        throw new Error("Enablement must not access a session or model service");
      } };
      const store = await (controls ? openProfileStore(ctx, z) : openEnablement(ctx, z)); stores.push(store); return store;
    };
    return await run(open);
  } finally {
    const closed = await Promise.allSettled(stores.map(store => store.close()));
    await root.fiber.dispose();
    assert.ok(closed.every(result => result.status === "fulfilled"), "all caller-owned stores must close");
  }
}

try {
  const persisted = await withStorage(async open => {
    const a = await open(profileA), b = await open(profileB);
    assert.deepEqual(a.getSnapshot(), { scope: "profile", revision: 0, enabled: { suggest: true, enhance: true } });
    assert.strictEqual(a.getSnapshot(), a.getSnapshot()); assert.ok(Object.isFrozen(a.getSnapshot().enabled));
    const seen = []; a.subscribe(snapshot => seen.push(snapshot));
    await Promise.all([a.set("suggest", false), a.set("enhance", false)]);
    assert.deepEqual(a.getSnapshot().enabled, { suggest: false, enhance: false }); assert.equal(a.getSnapshot().revision, 2);
    assert.deepEqual(b.getSnapshot().enabled, { suggest: true, enhance: true });
    await b.set("enhance", false);
    assert.equal(seen.length, 2); assert.deepEqual(a.getSnapshot().enabled, { suggest: false, enhance: false });
    const value = { a: a.getSnapshot(), b: b.getSnapshot() };
    await a.close();
    const alias = profileA + sep + ".." + sep + basename(profileA) + sep;
    const reopened = await open(process.platform === "win32" ? alias.toUpperCase() : alias);
    assert.deepEqual(reopened.getSnapshot(), value.a);
    return value;
  });
  await withStorage(async open => {
    const a = await open(profileA), b = await open(profileB);
    assert.deepEqual(a.getSnapshot(), persisted.a); assert.deepEqual(b.getSnapshot(), persisted.b);
    const before = a.getSnapshot();
    await assert.rejects(a.set("suggest", false, { expectedRevision: before.revision - 1 }), { code: "stale-enablement" });
    assert.strictEqual(a.getSnapshot(), before);
    const neverUsed = await open(join(temporary, "profiles", "Fresh"));
    assert.deepEqual(neverUsed.getSnapshot().enabled, { suggest: true, enhance: true });
    await a.set("suggest", true, { expectedRevision: before.revision });
    assert.deepEqual(b.getSnapshot(), persisted.b);
  });
  const files = await readdir(storageRoot); assert.equal(files.length, 2);
  for (const file of files) {
    assert.match(file, /^local_prompt_assist_enabled_[a-f0-9]{64}\.json$/);
    const text = await readFile(join(storageRoot, file), "utf8"), document = JSON.parse(text);
    assert.deepEqual(Object.keys(document.global).sort(), ["enabled", "revision"]);
    assert.deepEqual(Object.keys(document.global.enabled).sort(), ["enhance", "suggest"]);
    assert.equal(text.includes(profileA), false); assert.equal(text.includes(profileB), false);
    assert.equal(document.unit.version, 1); assert.deepEqual(document.tables, {});
  }
  const controls = await withStorage(async open => {
    const a = await open(profileA, true), b = await open(profileB, true);
    const before = a.getSnapshot();
    assert.deepEqual(before.enabled, { suggest: true, enhance: false }, 'existing flags survive without migration writes');
    assert.deepEqual(before.configured, { suggest: true, enhance: true });
    assert.equal(before.settingsRevision, 0);
    const input = { followSession: false, provider: 'offline', model: 'gpt-fixture', reasoningEffort: '', fast: false, rounds: 5, autoApply: true, streamWrite: false };
    const seen = []; a.subscribe(value => seen.push(value));
    await a.configure('enhance', input, { expectedRevision: before.settingsRevision });
    const saved = a.getSnapshot();
    assert.equal(saved.revision, before.revision, 'model saves do not rewrite feature flags');
    assert.equal(saved.settingsRevision, 1); assert.equal(saved.configured.enhance, true);
    assert.deepEqual(saved.settings.enhance, input); assert.equal(Object.hasOwn(saved.settings.enhance, 'enabled'), false);
    assert.equal(seen.length, 1); assert.strictEqual(seen[0], saved);
    assert.equal(b.getSnapshot().configured.enhance, true);
    await b.configure('suggest', { ...input, followSession: true, provider: '', model: '', rounds: 3 }, { expectedRevision: 0 });
    await assert.rejects(a.configure('enhance', { ...input, rounds: 9 }, { expectedRevision: 0 }), { code: 'stale-global-settings' });
    assert.strictEqual(a.getSnapshot(), saved);
    const records = { a: saved, b: b.getSnapshot() };
    await a.close();
    const reopened = await open(profileA, true); assert.deepEqual(reopened.getSnapshot(), records.a);
    return records;
  });
  await withStorage(async open => {
    const a = await open(profileA, true), b = await open(profileB, true);
    assert.deepEqual(a.getSnapshot(), controls.a); assert.deepEqual(b.getSnapshot(), controls.b);
  });
  // Old versions can still read the flags domain: controls never extend its strict record shape.
  await withStorage(async open => {
    const old = await open(profileA);
    assert.deepEqual(old.getSnapshot(), { scope: 'profile', revision: controls.a.revision, enabled: controls.a.enabled });
  });
  const allFiles = await readdir(storageRoot);
  assert.equal(allFiles.filter(name => name.startsWith('local_prompt_assist_controls_')).length, 2);
  for (const file of allFiles) {
    const text = await readFile(join(storageRoot, file), 'utf8');
    assert.equal(text.includes(profileA), false); assert.equal(text.includes(profileB), false);
    if (file.startsWith('local_prompt_assist_enabled_')) assert.deepEqual(Object.keys(JSON.parse(text).global).sort(), ['enabled', 'revision']);
  }
  console.log("Real profile enablement and controls persistence/isolation/rollback compatibility verified:", sdk.version, "; external model/server/profile operations: 0");
} finally {
  // Check the exact absolute target before deleting only this owned temporary tree.
  assert.ok(isAbsolute(temporary)); assert.equal(dirname(temporary), base); assert.ok(basename(temporary).startsWith(prefix));
  outsideRepository(temporary);
  await rm(temporary, { recursive: true, force: true });
}
