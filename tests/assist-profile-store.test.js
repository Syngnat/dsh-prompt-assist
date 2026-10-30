import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { openProfileStore } from '../assist/profile-store.js';

class Schema {
  constructor(read) { this.read = read; }
  parse(value) { return this.read(value); }
  optional() { return new Schema(value => value === undefined ? undefined : this.parse(value)); }
  strict() { return this; }
  refine(check) { return new Schema(value => { const parsed = this.parse(value); if (!check(parsed)) throw Error('schema'); return parsed; }); }
  int() { return this.refine(Number.isInteger); }
  min(n) { return this.refine(value => value >= n); }
  max(n) { return this.refine(value => value <= n); }
}
const scalar = type => new Schema(value => { if (typeof value !== type) throw Error('schema'); return value; });
const z = { boolean: () => scalar('boolean'), number: () => scalar('number'), string: () => scalar('string'),
  object: shape => new Schema(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(shape,key))) throw Error('schema');
    return Object.fromEntries(Object.entries(shape).map(([key,schema]) => [key,schema.parse(value[key])]));
  }) };
const defaults = () => ({followSession:true,provider:'',model:'',reasoningEffort:'',fast:false,rounds:1,autoApply:true,streamWrite:false});
function fixture() {
  const durable = new Map(), live = new Set(), specs = [], writes = [], hooks = {};
  const facility = { async open(spec) {
    specs.push(spec); await hooks.open?.(spec);
    if (live.has(spec.name)) throw Error('already open'); live.add(spec.name);
    let record = structuredClone(durable.get(spec.name) ?? spec.global.initial);
    return {global:{get:()=>record,async set(value){writes.push(value);await hooks.write?.(value);record=value;durable.set(spec.name,structuredClone(value));}},async close(){live.delete(spec.name);await hooks.close?.(spec);}};
  }};
  const ctx = (dir=resolve('synthetic-profiles','alpha')) => ({get:name => name==='storageDomain'?facility:name==='profileContext'?{dir}:undefined});
  return {durable,live,specs,writes,hooks,ctx};
}
async function opened(t,f=fixture(),dir) { const store=await openProfileStore(f.ctx(dir),z);t.after(()=>store.close());return {store,f}; }

test('profile controls start unconfirmed, keep flags separate, and persist without session migration',async t=>{
  const {store,f}=await opened(t),first=store.getSnapshot();
  assert.deepEqual(first,{scope:'profile',revision:0,enabled:{suggest:true,enhance:true},finalAnswer:true,finalAnswerRevision:0,processFeedback:true,processFeedbackRevision:0,settingsRevision:0,settings:{suggest:defaults(),enhance:defaults()},configured:{suggest:true,enhance:true}});
  assert.strictEqual(first,store.getSnapshot()); assert.ok(Object.isFrozen(first.settings.enhance));
  await store.set('suggest',false); assert.equal(store.getSnapshot().settingsRevision,0);
  const value=await store.configure('enhance',{...defaults(),rounds:5,enabled:false},{expectedRevision:0});
  assert.equal(value.enabled.enhance,true);assert.equal(value.revision,1);assert.equal(value.settingsRevision,1);assert.equal(value.configured.enhance,true);assert.equal(value.configured.suggest,true);
  assert.equal(Object.hasOwn(value.settings.enhance,'enabled'),false);
  assert.strictEqual(value.settings.suggest,first.settings.suggest);
  assert.equal(f.specs.length,4);assert.ok(f.specs.every(spec=>spec.version===1));
  assert.match(f.specs[0].name,/^local_prompt_assist_enabled_/);assert.match(f.specs[1].name,/^local_prompt_assist_final_answer_/);assert.match(f.specs[2].name,/^local_prompt_assist_process_feedback_/);assert.match(f.specs[3].name,/^local_prompt_assist_controls_/);
  await store.close();const reopened=await opened(t,f);assert.deepEqual(reopened.store.getSnapshot(),value);
});

test('controls remain profile isolated and old flags retain their exact records',async t=>{
 const f=fixture(),a=await opened(t,f),b=await opened(t,f,resolve('synthetic-profiles','beta'));
 await a.store.set('suggest',false);await a.store.configure('suggest',{...defaults(),rounds:7},{expectedRevision:0});
 assert.equal(b.store.getSnapshot().configured.suggest,true);assert.equal(b.store.getSnapshot().enabled.suggest,true);
 assert.deepEqual(f.durable.get(f.specs[0].name),{revision:1,enabled:{suggest:false,enhance:true}});
 const control=f.durable.get(f.specs[3].name);assert.deepEqual(Object.keys(control).sort(),['configured','revision','settings']);
});

test('required controls CAS serializes writers, no-op is stable, and flags have independent revisions',async t=>{
 const {store,f}=await opened(t),seen=[];store.subscribe(value=>seen.push(value));
 for(const options of [undefined,{},null,[],{expectedRevision:-1},{expectedRevision:'0'},{expectedRevision:0,extra:true}])await assert.rejects(store.configure('enhance',defaults(),options),{code:'invalid-request'});
 const results=await Promise.allSettled([store.configure('enhance',{...defaults(),rounds:5},{expectedRevision:0}),store.configure('suggest',defaults(),{expectedRevision:0})]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].reason.code,'stale-global-settings');
 const first=store.getSnapshot();assert.strictEqual(await store.configure('enhance',{...defaults(),rounds:5},{expectedRevision:1}),first);assert.equal(seen.length,1);
 await store.set('suggest',false);assert.equal(store.getSnapshot().settingsRevision,1);
 await assert.rejects(store.configure('enhance',defaults(),{expectedRevision:0}),{code:'stale-global-settings'});
 assert.equal(f.writes.length,2);assert.equal(seen.length,2);
});

test('bad controls fail without replacing memory or persisted records and initialization closes both stores',async t=>{
 const {store,f}=await opened(t),before=store.getSnapshot();
 for(const config of [{...defaults(),rounds:21},{...defaults(),fast:'yes'},{...defaults(),provider:' leading'}, {...defaults(),extra:1},{}])await assert.rejects(store.configure('enhance',config,{expectedRevision:0}));
 assert.equal(f.writes.length,0);f.hooks.write=async()=>{throw Error('private path');};
 await assert.rejects(store.configure('enhance',{...defaults(),rounds:5},{expectedRevision:0}),{code:'global-settings-unavailable'});assert.strictEqual(store.getSnapshot(),before);
 delete f.hooks.write;await store.configure('enhance',{...defaults(),rounds:5},{expectedRevision:0});await store.close();
 const name=f.specs[1].name,bad={...f.durable.get(name),settings:{suggest:defaults(),enhance:{...defaults(),enabled:true}}};f.durable.set(name,bad);
 await assert.rejects(openProfileStore(f.ctx(),z),{code:'global-settings-unavailable'});assert.equal(f.live.size,0);assert.strictEqual(f.durable.get(name),bad);
 const failed=fixture();failed.hooks.open=spec=>{if(spec.name.includes('_controls_'))throw Error('open failure');};
 await assert.rejects(openProfileStore(failed.ctx(),z),{code:'global-settings-unavailable'});assert.equal(failed.live.size,0);
});

const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {resolve,promise};};
test('cancel before commit writes nothing; cancel after commit starts publishes durable result; close drains both',async t=>{
 const {store,f}=await opened(t),pre=new AbortController();pre.abort();
 await assert.rejects(store.configure('enhance',defaults(),{expectedRevision:0,signal:pre.signal}),{name:'AbortError'});assert.equal(f.writes.length,0);
 const started=deferred(),gate=deferred(),controller=new AbortController();f.hooks.write=async()=>{started.resolve();await gate.promise;};
 const seen=[];store.subscribe(value=>seen.push(value));
 const first=store.configure('enhance',{...defaults(),rounds:5},{expectedRevision:0,signal:controller.signal});await started.promise;
 const queued=store.configure('suggest',defaults(),{expectedRevision:1,signal:controller.signal});const rejected=assert.rejects(queued,{name:'AbortError'});
 controller.abort();const closing=store.close();assert.strictEqual(store.close(),closing);
 await assert.rejects(store.configure('suggest',defaults(),{expectedRevision:1}),{code:'global-settings-unavailable'});
 gate.resolve();const committed=await first;await rejected;await closing;
 assert.equal(committed.configured.enhance,true);assert.equal(seen.length,1);assert.strictEqual(seen[0],committed);assert.equal(f.live.size,0);assert.equal(f.writes.length,1);
});

test('observer failures do not undo commits and close failure still closes the other domain',async()=>{
 const f=fixture(),store=await openProfileStore(f.ctx(),z);let notices=0;const stop=store.subscribe(()=>notices++);stop();
 store.subscribe(()=>{throw Error('observer');});store.subscribe(async()=>{throw Error('async observer');});
 await store.configure('enhance',{...defaults(),rounds:5},{expectedRevision:0});assert.equal(notices,0);
 f.hooks.close=spec=>{if(spec.name.includes('_enabled_'))throw Error('close');};
 await assert.rejects(store.close(),{code:'global-settings-unavailable'});assert.equal(f.live.size,0);
});

test('setFinalAnswer persists alone and rejects stale revisions',async t=>{
  const {store,f}=await opened(t);
  const next=await store.setFinalAnswer(false);
  assert.equal(next.finalAnswer,false);
  assert.equal(next.finalAnswerRevision,1);
  assert.equal(next.revision,0);
  assert.deepEqual(next.enabled,{suggest:true,enhance:true});
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].finalAnswer,false);
  // Idempotent write is a no-op, not a revision bump.
  const same=await store.setFinalAnswer(false);
  assert.equal(same.finalAnswerRevision,1);
  assert.equal(f.writes.length,1);
  await assert.rejects(()=>store.setFinalAnswer(true,{expectedRevision:0}),error=>error.code==='stale-enablement');
  // Flipping a feature flag must not silently reset the contract switch.
  await store.set('suggest',false);
  const after=store.getSnapshot();
  assert.equal(after.finalAnswer,false);
  assert.equal(after.enabled.suggest,false);
  await assert.rejects(()=>store.setFinalAnswer('yes'),error=>error.code==='invalid-enabled');
});

test('setProcessFeedback persists in its own domain and leaves the other switches intact',async t=>{
  const {store,f}=await opened(t);
  const next=await store.setProcessFeedback(false);
  assert.equal(next.processFeedback,false);
  assert.equal(next.processFeedbackRevision,1);
  assert.equal(next.finalAnswer,true);
  assert.equal(next.finalAnswerRevision,0);
  assert.equal(next.revision,0);
  assert.equal(next.settingsRevision,0);
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].processFeedback,false);
  const same=await store.setProcessFeedback(false);
  assert.equal(same.processFeedbackRevision,1);
  assert.equal(f.writes.length,1);
  await assert.rejects(()=>store.setProcessFeedback(true,{expectedRevision:0}),error=>error.code==='stale-enablement');
  await store.setFinalAnswer(false);
  const after=store.getSnapshot();
  assert.equal(after.processFeedback,false);
  assert.equal(after.finalAnswer,false);
  assert.equal(after.finalAnswerRevision,1);
  await assert.rejects(()=>store.setProcessFeedback('yes'),error=>error.code==='invalid-enabled');
});
