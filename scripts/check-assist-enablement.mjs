import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { mkdtemp, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openEnablement } from "../assist/enablement-store.js";
import { openProfileStore } from "../assist/profile-store.js";
import { AssistRuntime } from "../assist/runtime.js";

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
    const facility = root.get("storageDomain");
    const open = async (dir, controls = false, inspect) => {
      const profile = Object.freeze({ dir });
      const ctx = { get(name) {
        if (name === "profileContext") return profile;
        if (name === "storageDomain") return inspect ? {open(spec) {inspect(spec);return facility.open(spec);}} : facility;
        throw new Error("Enablement must not access a session or model service");
      } };
      const store = await (controls ? openProfileStore(ctx, z) : openEnablement(ctx, z)); stores.push(store); return store;
    };
    return await run(open, facility);
  } finally {
    const closed = await Promise.allSettled(stores.map(store => store.close()));
    await root.fiber.dispose();
    assert.ok(closed.every(result => result.status === "fulfilled"), "all caller-owned stores must close");
  }
}

const noteKey = (provider, model) => JSON.stringify([provider, model]);
function checkNotesSchema(schema) {
  const key = noteKey('网关/Case', '团队/Model/预览'), valid = {revision: 1, notes: {[key]: '单行说明'}};
  assert.equal(schema.safeParse(valid).success, true, 'native z.record must validate distinct key and value schemas');
  const invalid = [null, [], {...valid, extra: true}, {...valid, revision: -1}, {...valid, revision: 0.5},
    {...valid, revision: Number.MAX_SAFE_INTEGER + 1}, {...valid, notes: []}, {...valid, notes: null}, {...valid, notes: new Date(0)}, {...valid, notes: new Map()},
    ...['p/m', '__proto__', '["p", "m"]', JSON.stringify(['p']), JSON.stringify(['p', 'm', 'extra']),
      noteKey('', 'm'), noteKey('p', 'm'.repeat(201)), JSON.stringify([1, 'm'])]
      .map(key => ({revision: 1, notes: Object.fromEntries([[key, 'x']])})),
    ...[null, 42, '', ' leading', 'two  spaces', 'line\nbreak', 'line\u0085break', 'x'.repeat(121)]
      .map(text => ({revision: 1, notes: {[key]: text}})),
    {revision: 1, notes: Object.fromEntries(Array.from({length: 501}, (_, i) => [noteKey('p', 'm' + i), 'x']))}];
  for (const [index,record] of invalid.entries()) assert.equal(schema.safeParse(record).success, false, 'corrupt notes fixture ' + index + ' must fail the real native schema');
  assert.equal(schema.safeParse({revision: 0, notes: Object.fromEntries(Array.from({length: 500}, (_, i) => [noteKey('p', 'm' + i), 'x']))}).success, true);
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
  const controls = await withStorage(async open => {
    const a = await open(profileA, true), b = await open(profileB, true);
    const before = a.getSnapshot();
    assert.deepEqual(before.enabled, { suggest: false, enhance: true }, 'existing flags survive without migration writes');
    assert.deepEqual(before.configured, { suggest: false, enhance: false });
    assert.equal(before.settingsRevision, 0);
    const input = { followSession: false, provider: 'offline', model: 'gpt-fixture', reasoningEffort: '', fast: false, rounds: 5 };
    const seen = []; a.subscribe(value => seen.push(value));
    await a.configure('enhance', input, { expectedRevision: before.settingsRevision });
    const saved = a.getSnapshot();
    assert.equal(saved.revision, before.revision, 'model saves do not rewrite feature flags');
    assert.equal(saved.settingsRevision, 1); assert.equal(saved.configured.enhance, true);
    assert.deepEqual(saved.settings.enhance, input); assert.equal(Object.hasOwn(saved.settings.enhance, 'enabled'), false);
    assert.equal(seen.length, 1); assert.strictEqual(seen[0], saved);
    assert.equal(b.getSnapshot().configured.enhance, false);
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
  const descriptions = await withStorage(async open => {
    let notesSpec;
    const a = await open(profileA, true, spec => {if (spec.name.startsWith('local_prompt_assist_model_notes_')) notesSpec = spec;});
    const b = await open(profileB, true), before = a.getSnapshot();
    assert.equal(before.notesAvailable, true); assert.equal(before.notesRevision, 0); assert.deepEqual(before.notes, {});
    checkNotesSchema(notesSpec.global.schema);
    const runtime = new AssistRuntime({}, {}, [], () => {throw Error('model calls forbidden');}, a);
    const controllers = [], cached = [];
    for (const id of ['a', 'b']) for (const feature of ['suggest', 'enhance']) {
      const controller = new AbortController(), slot = id + ':' + feature, value = Object.freeze({fixture: slot});
      controllers.push(controller); runtime.jobs.set(slot, {controller}); runtime.cache.set(slot, value); cached.push([slot, value]);
    }
    try {
      const input = {action: 'save-note', sessionId: '', provider: '网关/Case', model: '团队/Model/预览', text: '  擅长\r\n代码\t与推理  ', expectedRevision: 0};
      await assert.rejects(runtime.dispatch(input), {code: 'forbidden'});
      await assert.rejects(runtime.dispatch(input, {fromUI: true, agent: {session: {header: {origin: 'subagent'}}}}), {code: 'forbidden'});
      const writers = await Promise.allSettled([runtime.dispatch(input, {fromUI: true}), runtime.dispatch({...input, text: 'must not overwrite'}, {fromUI: true})]);
      assert.equal(writers[0].status, 'fulfilled'); assert.equal(writers[1].reason.code, 'stale-model-notes');
      assert.equal(a.getSnapshot().notes[noteKey(input.provider, input.model)], '擅长 代码 与推理');
      // These two routes collide under provider + '/' + model, but remain distinct tuple keys.
      await a.saveNote('网关', 'Case/团队/Model/预览', 'separate route', {expectedRevision: 1});
      await a.saveNote('__proto__', 'quoted"/模型', 'special strings', {expectedRevision: 2});
      await a.saveNote('p'.repeat(200), 'm'.repeat(200), '界'.repeat(120), {expectedRevision: 3});
      const saved = a.getSnapshot();
      assert.strictEqual(await a.saveNote(input.provider, input.model, '擅长 代码 与推理', {expectedRevision: 4}), saved);
      assert.equal(Object.keys(saved.notes).length, 4); assert.equal(saved.notesRevision, 4);
      assert.ok(Object.isFrozen(saved)); assert.ok(Object.isFrozen(saved.notes));
      assert.equal(saved.revision, before.revision); assert.equal(saved.settingsRevision, before.settingsRevision);
      for (const field of ['enabled', 'settings', 'configured']) assert.strictEqual(saved[field], before[field]);
      assert.ok(controllers.every(controller => !controller.signal.aborted)); assert.deepEqual([...runtime.cache.entries()], cached);
      await b.saveNote(input.provider, input.model, 'profile B', {expectedRevision: 0});
      assert.equal(a.getSnapshot().notes[noteKey(input.provider, input.model)], '擅长 代码 与推理');
      const records = {a: saved, b: b.getSnapshot()};
      await a.close();
      const reopened = await open(profileA, true); assert.deepEqual(reopened.getSnapshot(), saved);
      assert.ok(Object.isFrozen(reopened.getSnapshot().notes));
      return records;
    } finally {runtime.dispose();}
  });
  await withStorage(async open => {
    const a = await open(profileA, true), b = await open(profileB, true);
    assert.deepEqual(a.getSnapshot(), descriptions.a); assert.deepEqual(b.getSnapshot(), descriptions.b);
  });
  // Old versions can still read the flags domain: controls never extend its strict record shape.
  await withStorage(async open => {
    const old = await open(profileA);
    assert.deepEqual(old.getSnapshot(), { scope: 'profile', revision: controls.a.revision, enabled: controls.a.enabled });
  });
  const allFiles = await readdir(storageRoot);
  assert.equal(allFiles.filter(name => name.startsWith('local_prompt_assist_controls_')).length, 2);
  assert.equal(allFiles.filter(name => name.startsWith('local_prompt_assist_model_notes_')).length, 2);
  for (const file of allFiles) {
    const text = await readFile(join(storageRoot, file), 'utf8');
    assert.equal(text.includes(profileA), false); assert.equal(text.includes(profileB), false);
    if (file.startsWith('local_prompt_assist_enabled_')) assert.deepEqual(Object.keys(JSON.parse(text).global).sort(), ['enabled', 'revision']);
    if (file.startsWith('local_prompt_assist_controls_')) assert.deepEqual(Object.keys(JSON.parse(text).global).sort(), ['configured', 'revision', 'settings']);
    if (file.startsWith('local_prompt_assist_model_notes_')) assert.deepEqual(Object.keys(JSON.parse(text).global).sort(), ['notes', 'revision']);
  }
  const damagedProfile = join(temporary, 'profiles', 'Corrupt Notes');
  let damagedSpec;
  await withStorage(async open => {
    const store = await open(damagedProfile, true, spec => {if (spec.name.startsWith('local_prompt_assist_model_notes_')) damagedSpec = spec;});
    await store.saveNote('p', 'namespace/model', 'last durable note', {expectedRevision: 0});
  });
  const damagedFile = join(storageRoot, damagedSpec.name + '.json'), original = await readFile(damagedFile, 'utf8');
  const damaged = JSON.parse(original); damaged.global.notes = {'p/namespace/model': 'ambiguous legacy key'};
  const damagedText = JSON.stringify(damaged); await writeFile(damagedFile, damagedText);
  await withStorage(async (open, facility) => {
    const store = await open(damagedProfile, true), snapshot = store.getSnapshot();
    assert.equal(snapshot.notesAvailable, false); assert.deepEqual(snapshot.notes, {}); assert.equal(snapshot.notesRevision, 0);
    assert.equal(facility.get(damagedSpec.name), undefined, 'failed native load must release its domain');
    await assert.rejects(store.saveNote('p', 'namespace/model', 'no memory fallback', {expectedRevision: 0}), {code: 'model-notes-unavailable', message: 'model-notes-unavailable'});
    await store.set('enhance', true);
    await store.configure('enhance', {followSession: true, provider: '', model: '', reasoningEffort: '', fast: false, rounds: 2}, {expectedRevision: 0});
    assert.equal(store.getSnapshot().notesAvailable, false); assert.equal(store.getSnapshot().configured.enhance, true);
    assert.equal(await readFile(damagedFile, 'utf8'), damagedText, 'corrupt notes must never be silently replaced');
    await writeFile(damagedFile, original); await store.close();
    const recovered = await open(damagedProfile, true); assert.equal(recovered.getSnapshot().notesAvailable, true);
    assert.deepEqual(recovered.getSnapshot().notes, {[noteKey('p', 'namespace/model')]: 'last durable note'});
  });
  await withStorage(async (open, facility) => {
    let acquired;
    const profile = join(temporary, 'profiles', 'Invalid Initial Notes');
    const store = await open(profile, true, spec => {
      if (!spec.name.startsWith('local_prompt_assist_model_notes_')) return;
      acquired = spec.name; spec.global.initial = {revision: 0, notes: {'bad/key': 'invalid'}};
    });
    assert.equal(store.getSnapshot().notesAvailable, false);
    assert.equal(facility.get(acquired), undefined, 'post-open schema failure must close an acquired native domain');
    await store.close();
    const reopened = await open(profile, true); assert.equal(reopened.getSnapshot().notesAvailable, true);
  });
  console.log("Real profile flags/controls/notes persistence, CAS, schema, isolation, cleanup and rollback compatibility verified:", sdk.version, "; external model/server/profile operations: 0");
} finally {
  // Check the exact absolute target before deleting only this owned temporary tree.
  assert.ok(isAbsolute(temporary)); assert.equal(dirname(temporary), base); assert.ok(basename(temporary).startsWith(prefix));
  outsideRepository(temporary);
  await rm(temporary, { recursive: true, force: true });
}
