import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openEnablement } from "../assist/enablement-store.js";

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
    const open = async dir => {
      const profile = Object.freeze({ dir });
      const ctx = { get(name) {
        if (name === "profileContext") return profile;
        if (name === "storageDomain") return root.get(name);
        throw new Error("Enablement must not access a session or model service");
      } };
      const store = await openEnablement(ctx, z); stores.push(store); return store;
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
    assert.deepEqual(a.getSnapshot(), { scope: "profile", revision: 0, enabled: { suggest: false, enhance: false } });
    assert.strictEqual(a.getSnapshot(), a.getSnapshot()); assert.ok(Object.isFrozen(a.getSnapshot().enabled));
    const seen = []; a.subscribe(snapshot => seen.push(snapshot));
    await Promise.all([a.set("suggest", true), a.set("enhance", true)]);
    assert.deepEqual(a.getSnapshot().enabled, { suggest: true, enhance: true }); assert.equal(a.getSnapshot().revision, 2);
    assert.deepEqual(b.getSnapshot().enabled, { suggest: false, enhance: false });
    await b.set("enhance", true);
    assert.equal(seen.length, 2); assert.deepEqual(a.getSnapshot().enabled, { suggest: true, enhance: true });
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
    assert.deepEqual(neverUsed.getSnapshot().enabled, { suggest: false, enhance: false });
    await a.set("suggest", false, { expectedRevision: before.revision });
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
  console.log("Real profile enablement persistence/isolation verified:", sdk.version, "; external model/server/profile operations: 0");
} finally {
  // Check the exact absolute target before deleting only this owned temporary tree.
  assert.ok(isAbsolute(temporary)); assert.equal(dirname(temporary), base); assert.ok(basename(temporary).startsWith(prefix));
  outsideRepository(temporary);
  await rm(temporary, { recursive: true, force: true });
}
