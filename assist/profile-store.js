import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { openEnablement } from './enablement-store.js';
import { normalizeConfig } from './config.js';

const FEATURES = ['suggest', 'enhance'];
const FIELDS = ['followSession', 'provider', 'model', 'reasoningEffort', 'fast', 'rounds'];
// Display annotations for the composer model menu. Independent of the controls domain.
const NOTE_ID_MAX = 200;
const NOTE_MAX = 120;
const NOTES_MAX = 500;
const failure = code => Object.assign(new Error(code), { code });
const unavailable = () => failure('global-settings-unavailable');
const notesUnavailable = () => failure('model-notes-unavailable');
const optional = (ctx, name) => typeof ctx?.get === 'function' ? ctx.get(name) : ctx?.[name];
function configOf(input, complete = true) {
  if (complete && (!input || FIELDS.some(key => !Object.hasOwn(input, key)))) throw failure('invalid-config');
  const { enabled: _ignored, ...config } = normalizeConfig(input);
  return Object.freeze(config);
}
function freezeRecord(record) {
  return Object.freeze({revision:record.revision,
    settings:Object.freeze({suggest:Object.freeze(record.settings.suggest),enhance:Object.freeze(record.settings.enhance)}),
    configured:Object.freeze({...record.configured})});
}
function schemaOf(z) {
  const config = z.object({followSession:z.boolean(),provider:z.string(),model:z.string(),reasoningEffort:z.string(),fast:z.boolean(),rounds:z.number().int().min(1).max(20)}).strict().refine(value => {
    try { configOf(value); return true; } catch { return false; }
  });
  return z.object({revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    settings:z.object({suggest:config,enhance:config}).strict(),
    configured:z.object({suggest:z.boolean(),enhance:z.boolean()}).strict()}).strict();
}
function domainName(dir) {
  if (typeof dir !== 'string' || !isAbsolute(dir) || dir.includes('\u0000')) throw unavailable();
  const absolute = resolve(dir), canonical = process.platform === 'win32' ? absolute.toLowerCase() : absolute;
  return 'local_prompt_assist_controls_' + createHash('sha256').update(canonical,'utf8').digest('hex');
}
function notesDomainName(dir) {
  if (typeof dir !== 'string' || !isAbsolute(dir) || dir.includes('\u0000')) throw unavailable();
  const absolute = resolve(dir), canonical = process.platform === 'win32' ? absolute.toLowerCase() : absolute;
  return 'local_prompt_assist_model_notes_' + createHash('sha256').update(canonical,'utf8').digest('hex');
}
const validNoteId = value => typeof value === 'string' && value.length > 0 && value.length <= NOTE_ID_MAX;
const oneLine = value => value.replace(/[\s\u0085]+/gu,' ').trim();
function noteKey(provider,model) {
  if (!validNoteId(provider) || !validNoteId(model)) throw failure('invalid-note-key');
  return JSON.stringify([provider,model]);
}
function validNoteKey(key) {
  try {
    const ids = JSON.parse(key);
    return Array.isArray(ids) && ids.length === 2 && ids.every(validNoteId) && JSON.stringify(ids) === key;
  } catch { return false; }
}
function normalizeNote(value) {
  if (typeof value !== 'string') throw failure('invalid-note');
  const text = oneLine(value);
  if (text.length > NOTE_MAX) throw failure('invalid-note');
  return text;
}
function freezeNotes(record) {
  return Object.freeze({revision:record.revision,notes:Object.freeze({...record.notes})});
}
function notesSchemaOf(z) {
  // Validate raw keys before z.record can discard a reserved key such as __proto__.
  const notes = z.unknown().refine(value => value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Object.keys(value).length <= NOTES_MAX && Object.keys(value).every(validNoteKey))
    .pipe(z.record(z.string(), z.string().refine(text =>
      text.length > 0 && text.length <= NOTE_MAX && oneLine(text) === text)));
  return z.object({revision:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),notes}).strict();
}
function emptyNotes() { return freezeNotes({revision:0,notes:{}}); }

/** Keep the original flag domain intact; controls are independently versioned and never seeded from sessions. */
export async function openProfileStore(ctx,z) {
  let flags, domain, controls, notes;
  try {
    flags = await openEnablement(ctx,z);
    const facility = optional(ctx,'storageDomain'), schema = schemaOf(z);
    const initial = freezeRecord({revision:0,settings:{suggest:configOf({},false),enhance:configOf({},false)},configured:{suggest:false,enhance:false}});
    domain = await facility.open({name:domainName(optional(ctx,'profileContext')?.dir),version:1,global:{schema,initial},tables:{}});
    if (typeof domain?.global?.get !== 'function' || typeof domain?.global?.set !== 'function' || typeof domain?.close !== 'function') throw unavailable();
    controls = controlsStore(domain,freezeRecord(schema.parse(domain.global.get())));
    notes = await openNotes(ctx,z);
    return combine(flags,controls,notes);
  } catch {
    await Promise.allSettled([Promise.resolve().then(()=>flags?.close()),Promise.resolve().then(()=>controls ? controls.close() : domain?.close()),Promise.resolve().then(()=>notes?.close())]);
    throw unavailable();
  }
}

/** Descriptions are display annotations; a broken notes store must never disable assist features. */
async function openNotes(ctx,z) {
  let domain;
  try {
    const facility = optional(ctx,'storageDomain');
    if (typeof facility?.open !== 'function') throw notesUnavailable();
    const schema = notesSchemaOf(z);
    domain = await facility.open({name:notesDomainName(optional(ctx,'profileContext')?.dir),version:1,global:{schema,initial:emptyNotes()},tables:{}});
    if (typeof domain?.global?.get !== 'function' || typeof domain?.global?.set !== 'function' || typeof domain?.close !== 'function') throw notesUnavailable();
    return notesStore(domain,freezeNotes(schema.parse(domain.global.get())));
  } catch {
    try { await domain?.close(); } catch {}
    return notesStore(null,emptyNotes());
  }
}

function notesStore(domain,loaded) {
  let snapshot=Object.freeze({...loaded,available:!!domain}),tail=Promise.resolve(),closing=false,disposal;
  const listeners=new Set();
  function notify() {
    for (const listener of [...listeners]) if (listeners.has(listener)) {
      try { void Promise.resolve(listener(snapshot)).catch(()=>{}); } catch {}
    }
  }
  function disable() {
    snapshot=Object.freeze({...snapshot,available:false});
    notify();
    return notesUnavailable();
  }
  return Object.freeze({
    getSnapshot:()=>snapshot,
    save(provider,model,text,options) {
      if (closing || !snapshot.available) return Promise.reject(notesUnavailable());
      let key,value,signal,expectedRevision;
      try {
        if (!options || typeof options!=='object' || Array.isArray(options) || !Object.hasOwn(options,'expectedRevision') || Object.keys(options).some(name=>!['expectedRevision','signal'].includes(name))) throw failure('invalid-request');
        ({signal,expectedRevision}=options);
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision<0) throw failure('invalid-request');
        if (signal!==undefined && (typeof signal?.throwIfAborted!=='function' || typeof signal.aborted!=='boolean')) throw failure('invalid-request');
        key=noteKey(provider,model);
        signal?.throwIfAborted(); value=normalizeNote(text);
      } catch(error) { return Promise.reject(error); }
      const operation=tail.then(async()=>{
        signal?.throwIfAborted();
        if (!snapshot.available) throw notesUnavailable();
        if (expectedRevision!==snapshot.revision) throw failure('stale-model-notes');
        if ((snapshot.notes[key] ?? '')===value) return snapshot;
        if (snapshot.revision===Number.MAX_SAFE_INTEGER) throw disable();
        const notes={...snapshot.notes};
        if (value==='') delete notes[key];
        else {
          if (!Object.hasOwn(notes,key) && Object.keys(notes).length>=NOTES_MAX) throw failure('too-many-model-notes');
          notes[key]=value;
        }
        const record=freezeNotes({revision:snapshot.revision+1,notes});
        // Once persistence starts, cancellation cannot retract the durable commit.
        try { await domain.global.set(record); } catch { throw disable(); }
        snapshot=Object.freeze({...record,available:true});
        notify();
        return snapshot;
      });
      tail=operation.then(()=>{},()=>{});return operation;
    },
    subscribe(listener) {
      if (closing) throw notesUnavailable();
      if (typeof listener!=='function') throw failure('invalid-request');
      listeners.add(listener);return ()=>listeners.delete(listener);
    },
    close() {
      closing=true;
      disposal??=tail.then(async()=>{try {await domain?.close();} catch {throw notesUnavailable();} finally {listeners.clear();}});
      return disposal;
    },
  });
}

function controlsStore(domain,loaded) {
  let snapshot=loaded, tail=Promise.resolve(), closing=false, disposal;
  const listeners=new Set();
  return Object.freeze({
    getSnapshot:()=>snapshot,
    configure(feature,input,options) {
      if (closing) return Promise.reject(unavailable());
      let config,signal,expectedRevision;
      try {
        if (!FEATURES.includes(feature)) throw failure('invalid-feature');
        if (!options || typeof options!=='object' || Array.isArray(options) || Object.keys(options).some(key=>!['expectedRevision','signal'].includes(key))) throw failure('invalid-request');
        ({signal,expectedRevision}=options);
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision<0) throw failure('invalid-request');
        if (signal!==undefined && (typeof signal?.throwIfAborted!=='function' || typeof signal.aborted!=='boolean')) throw failure('invalid-request');
        signal?.throwIfAborted(); config=configOf(input);
      } catch(error) { return Promise.reject(error); }
      const operation=tail.then(async()=>{
        signal?.throwIfAborted();
        if (expectedRevision!==snapshot.revision) throw failure('stale-global-settings');
        if (snapshot.configured[feature] && FIELDS.every(key=>snapshot.settings[feature][key]===config[key])) return snapshot;
        if (snapshot.revision===Number.MAX_SAFE_INTEGER) throw unavailable();
        const record=freezeRecord({revision:snapshot.revision+1,settings:{...snapshot.settings,[feature]:config},configured:{...snapshot.configured,[feature]:true}});
        // Once persistence starts, cancellation cannot retract the durable commit.
        try { await domain.global.set(record); } catch { throw unavailable(); }
        snapshot=record;
        for (const listener of [...listeners]) if (listeners.has(listener)) {
          try { void Promise.resolve(listener(snapshot)).catch(()=>{}); } catch {}
        }
        return snapshot;
      });
      tail=operation.then(()=>{},()=>{});return operation;
    },
    subscribe(listener) {
      if (closing) throw unavailable();
      if (typeof listener!=='function') throw failure('invalid-request');
      listeners.add(listener);return ()=>listeners.delete(listener);
    },
    close() {
      closing=true;
      disposal??=tail.then(async()=>{try {await domain.close();} catch {throw unavailable();} finally {listeners.clear();}});
      return disposal;
    },
  });
}

function combine(flags,controls,notes) {
  const listeners=new Set();let snapshot,closing=false,disposal;
  function refresh() {
    const flag=flags.getSnapshot(),control=controls.getSnapshot(),note=notes.getSnapshot();
    snapshot=Object.freeze({scope:'profile',revision:flag.revision,enabled:flag.enabled,settingsRevision:control.revision,settings:control.settings,configured:control.configured,
      notesRevision:note.revision,notes:note.notes,notesAvailable:note.available});
    for (const listener of [...listeners]) if (listeners.has(listener)) {
      try {void Promise.resolve(listener(snapshot)).catch(()=>{});} catch {}
    }
  }
  refresh();
  const stopFlags=flags.subscribe(refresh);
  let stopControls,stopNotes;
  try {stopControls=controls.subscribe(refresh);} catch(error) {stopFlags();throw error;}
  try {stopNotes=notes.subscribe(refresh);} catch(error) {stopFlags();stopControls();throw error;}
  return Object.freeze({
    getSnapshot:()=>snapshot,
    // Preserve flag validation, CAS semantics and return value for rollback compatibility.
    set:(feature,enabled,options)=>flags.set(feature,enabled,options),
    async configure(feature,config,options) {await controls.configure(feature,config,options);return snapshot;},
    async saveNote(provider,model,text,options) {await notes.save(provider,model,text,options);return snapshot;},
    subscribe(listener) {
      if (closing) throw unavailable();
      if (typeof listener!=='function') throw failure('invalid-request');
      listeners.add(listener);return ()=>listeners.delete(listener);
    },
    close() {
      closing=true;
      disposal??=Promise.allSettled([flags.close(),controls.close(),notes.close()]).then(results=>{
        stopFlags();stopControls();stopNotes();listeners.clear();
        if (results.slice(0,2).some(result=>result.status==='rejected')) throw unavailable();
        if (results[2].status==='rejected') throw notesUnavailable();
      });
      return disposal;
    },
  });
}
