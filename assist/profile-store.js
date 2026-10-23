import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { openEnablement } from './enablement-store.js';
import { normalizeConfig } from './config.js';

const FEATURES = ['suggest', 'enhance'];
const FIELDS = ['followSession', 'provider', 'model', 'reasoningEffort', 'fast', 'rounds'];
const failure = code => Object.assign(new Error(code), { code });
const unavailable = () => failure('global-settings-unavailable');
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

/** Keep the original flag domain intact; controls are independently versioned and never seeded from sessions. */
export async function openProfileStore(ctx,z) {
  let flags, domain, controls;
  try {
    flags = await openEnablement(ctx,z);
    const facility = optional(ctx,'storageDomain'), schema = schemaOf(z);
    const initial = freezeRecord({revision:0,settings:{suggest:configOf({},false),enhance:configOf({},false)},configured:{suggest:true,enhance:true}});
    domain = await facility.open({name:domainName(optional(ctx,'profileContext')?.dir),version:1,global:{schema,initial},tables:{}});
    if (typeof domain?.global?.get !== 'function' || typeof domain?.global?.set !== 'function' || typeof domain?.close !== 'function') throw unavailable();
    controls = controlsStore(domain,freezeRecord(schema.parse(domain.global.get())));
    return combine(flags,controls);
  } catch {
    await Promise.allSettled([Promise.resolve().then(()=>flags?.close()),Promise.resolve().then(()=>controls ? controls.close() : domain?.close())]);
    throw unavailable();
  }
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

function combine(flags,controls) {
  const listeners=new Set();let snapshot,closing=false,disposal;
  function refresh() {
    const flag=flags.getSnapshot(),control=controls.getSnapshot();
    snapshot=Object.freeze({scope:'profile',revision:flag.revision,enabled:flag.enabled,settingsRevision:control.revision,settings:control.settings,configured:control.configured});
    for (const listener of [...listeners]) if (listeners.has(listener)) {
      try {void Promise.resolve(listener(snapshot)).catch(()=>{});} catch {}
    }
  }
  refresh();
  const stopFlags=flags.subscribe(refresh);
  let stopControls;
  try {stopControls=controls.subscribe(refresh);} catch(error) {stopFlags();throw error;}
  return Object.freeze({
    getSnapshot:()=>snapshot,
    // Preserve flag validation, CAS semantics and return value for rollback compatibility.
    set:(feature,enabled,options)=>flags.set(feature,enabled,options),
    async configure(feature,config,options) {await controls.configure(feature,config,options);return snapshot;},
    subscribe(listener) {
      if (closing) throw unavailable();
      if (typeof listener!=='function') throw failure('invalid-request');
      listeners.add(listener);return ()=>listeners.delete(listener);
    },
    close() {
      closing=true;
      disposal??=Promise.allSettled([flags.close(),controls.close()]).then(results=>{
        stopFlags();stopControls();listeners.clear();
        if (results.some(result=>result.status==='rejected')) throw unavailable();
      });
      return disposal;
    },
  });
}
