import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { openProfileStore } from '../assist/profile-store.js';

class Schema {
  constructor(read) { this.read = read; }
  parse(value) { return this.read(value); }
  strict() { return this; }
  refine(check) { return new Schema(value => { const parsed = this.parse(value); if (!check(parsed)) throw Error('schema'); return parsed; }); }
  pipe(schema) { return new Schema(value => schema.parse(this.parse(value))); }
  int() { return this.refine(Number.isInteger); }
  min(n) { return this.refine(value => value >= n); }
  max(n) { return this.refine(value => value <= n); }
}
const scalar = type => new Schema(value => { if (typeof value !== type) throw Error('schema'); return value; });
const z = { boolean: () => scalar('boolean'), number: () => scalar('number'), string: () => scalar('string'), unknown: () => new Schema(value => value),
  record: (keySchema,valueSchema) => new Schema(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('schema');
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '__proto__').map(([key,item]) => [keySchema.parse(key),valueSchema.parse(item)]));
  }),
  object: shape => new Schema(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(shape,key))) throw Error('schema');
    return Object.fromEntries(Object.entries(shape).map(([key,schema]) => [key,schema.parse(value[key])]));
  }) };
const defaults = () => ({followSession:true,provider:'',model:'',reasoningEffort:'',fast:false,rounds:1});
function fixture() {
  const durable = new Map(), live = new Set(), specs = [], writes = [], closed = [], hooks = {};
  const facility = { async open(spec) {
    specs.push(spec); await hooks.open?.(spec);
    if (live.has(spec.name)) throw Error('already open'); live.add(spec.name);
    let record = structuredClone(durable.has(spec.name) ? durable.get(spec.name) : spec.global.initial);
    const domain = {global:{get:()=>record,async set(value){writes.push(value);await hooks.write?.(value,spec);record=value;durable.set(spec.name,structuredClone(value));}},async close(){live.delete(spec.name);closed.push(spec.name);await hooks.close?.(spec);}};
    return hooks.domain ? hooks.domain(domain,spec) : domain;
  }};
  const ctx = (dir=resolve('synthetic-profiles','alpha')) => ({get:name => name==='storageDomain'?facility:name==='profileContext'?{dir}:undefined});
  return {durable,live,specs,writes,closed,hooks,ctx};
}
async function opened(t,f=fixture(),dir) { const store=await openProfileStore(f.ctx(dir),z);t.after(()=>store.close());return {store,f}; }

test('profile controls start unconfirmed, keep flags separate, and persist without session migration',async t=>{
  const {store,f}=await opened(t),first=store.getSnapshot();
  assert.deepEqual(first,{scope:'profile',revision:0,enabled:{suggest:false,enhance:false},settingsRevision:0,settings:{suggest:defaults(),enhance:defaults()},configured:{suggest:false,enhance:false},notesRevision:0,notes:{},notesAvailable:true});
  assert.strictEqual(first,store.getSnapshot()); assert.ok(Object.isFrozen(first.settings.enhance));
  await store.set('enhance',true); assert.equal(store.getSnapshot().settingsRevision,0);
  const value=await store.configure('enhance',{...defaults(),rounds:5,enabled:false},{expectedRevision:0});
  assert.equal(value.enabled.enhance,true);assert.equal(value.revision,1);assert.equal(value.settingsRevision,1);assert.equal(value.configured.enhance,true);assert.equal(value.configured.suggest,false);
  assert.equal(Object.hasOwn(value.settings.enhance,'enabled'),false);
  assert.strictEqual(value.settings.suggest,first.settings.suggest);
  assert.equal(f.specs.length,3);assert.ok(f.specs.every(spec=>spec.version===1));
  assert.match(f.specs[0].name,/^local_prompt_assist_enabled_/);assert.match(f.specs[1].name,/^local_prompt_assist_controls_/);assert.match(f.specs[2].name,/^local_prompt_assist_model_notes_/);
  await store.close();const reopened=await opened(t,f);assert.deepEqual(reopened.store.getSnapshot(),value);
});

test('controls remain profile isolated and old flags retain their exact records',async t=>{
 const f=fixture(),a=await opened(t,f),b=await opened(t,f,resolve('synthetic-profiles','beta'));
 await a.store.set('suggest',true);await a.store.configure('suggest',{...defaults(),rounds:7},{expectedRevision:0});
 assert.equal(b.store.getSnapshot().configured.suggest,false);assert.equal(b.store.getSnapshot().enabled.suggest,false);
 assert.deepEqual(f.durable.get(f.specs[0].name),{revision:1,enabled:{suggest:true,enhance:false}});
 const control=f.durable.get(f.specs[1].name);assert.deepEqual(Object.keys(control).sort(),['configured','revision','settings']);
});

test('required controls CAS serializes writers, no-op is stable, and flags have independent revisions',async t=>{
 const {store,f}=await opened(t),seen=[];store.subscribe(value=>seen.push(value));
 for(const options of [undefined,{},null,[],{expectedRevision:-1},{expectedRevision:'0'},{expectedRevision:0,extra:true}])await assert.rejects(store.configure('enhance',defaults(),options),{code:'invalid-request'});
 const results=await Promise.allSettled([store.configure('enhance',defaults(),{expectedRevision:0}),store.configure('suggest',defaults(),{expectedRevision:0})]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].reason.code,'stale-global-settings');
 const first=store.getSnapshot();assert.strictEqual(await store.configure('enhance',defaults(),{expectedRevision:1}),first);assert.equal(seen.length,1);
 await store.set('suggest',true);assert.equal(store.getSnapshot().settingsRevision,1);
 await assert.rejects(store.configure('enhance',defaults(),{expectedRevision:0}),{code:'stale-global-settings'});
 assert.equal(f.writes.length,2);assert.equal(seen.length,2);
});

test('bad controls fail without replacing memory or persisted records and initialization closes both stores',async t=>{
 const {store,f}=await opened(t),before=store.getSnapshot();
 for(const config of [{...defaults(),rounds:21},{...defaults(),fast:'yes'},{...defaults(),provider:' leading'}, {...defaults(),extra:1},{}])await assert.rejects(store.configure('enhance',config,{expectedRevision:0}));
 assert.equal(f.writes.length,0);f.hooks.write=async()=>{throw Error('private path');};
 await assert.rejects(store.configure('enhance',defaults(),{expectedRevision:0}),{code:'global-settings-unavailable'});assert.strictEqual(store.getSnapshot(),before);
 delete f.hooks.write;await store.configure('enhance',defaults(),{expectedRevision:0});await store.close();
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
 const first=store.configure('enhance',defaults(),{expectedRevision:0,signal:controller.signal});await started.promise;
 const queued=store.configure('suggest',defaults(),{expectedRevision:1,signal:controller.signal});const rejected=assert.rejects(queued,{name:'AbortError'});
 controller.abort();const closing=store.close();assert.strictEqual(store.close(),closing);
 await assert.rejects(store.configure('suggest',defaults(),{expectedRevision:1}),{code:'global-settings-unavailable'});
 gate.resolve();const committed=await first;await rejected;await closing;
 assert.equal(committed.configured.enhance,true);assert.equal(seen.length,1);assert.strictEqual(seen[0],committed);assert.equal(f.live.size,0);assert.equal(f.writes.length,1);
});

test('observer failures do not undo commits and close failure still closes the other domain',async()=>{
 const f=fixture(),store=await openProfileStore(f.ctx(),z);let notices=0;const stop=store.subscribe(()=>notices++);stop();
 store.subscribe(()=>{throw Error('observer');});store.subscribe(async()=>{throw Error('async observer');});
 await store.configure('enhance',defaults(),{expectedRevision:0});assert.equal(notices,0);
 f.hooks.close=spec=>{if(spec.name.includes('_enabled_'))throw Error('close');};
 await assert.rejects(store.close(),{code:'global-settings-unavailable'});assert.equal(f.live.size,0);
});

const keyOf = (provider,model) => JSON.stringify([provider,model]);
const isNotes = spec => spec.name.includes('_model_notes_');
function seededNotes(record) {
 const f=fixture();f.hooks.open=spec=>{if(isNotes(spec))f.durable.set(spec.name,record);};return f;
}

test('the record mock validates keys and values separately like native z.record',()=>{
 const schema=z.record(z.string().refine(key=>key==='accepted'),z.number().int());
 assert.deepEqual(schema.parse({accepted:3}),{accepted:3});
 assert.throws(()=>schema.parse({rejected:3}));assert.throws(()=>schema.parse({accepted:'3'}));
 assert.deepEqual(schema.parse(Object.fromEntries([['__proto__',3]])),{},'native records skip this reserved key before parsing');
});

test('nonempty descriptions round-trip immutable and normalized without rewriting flags or controls',async t=>{
 const {store,f}=await opened(t),before=store.getSnapshot(),key=keyOf('网关/自定义','团队/Model-V1/预览');
 const saved=await store.saveNote('网关/自定义','团队/Model-V1/预览','  擅长\r\n代码\t与\u2028推理\u0085任务  ',{expectedRevision:0});
 assert.deepEqual(saved.notes,{[key]:'擅长 代码 与 推理 任务'});assert.equal(saved.notesRevision,1);assert.equal(saved.notesAvailable,true);
 assert.equal(saved.revision,0);assert.equal(saved.settingsRevision,0);
 for(const field of ['enabled','settings','configured'])assert.strictEqual(saved[field],before[field]);
 assert.ok(Object.isFrozen(saved));assert.ok(Object.isFrozen(saved.notes));assert.throws(()=>{saved.notes[key]='overwrite';},TypeError);
 assert.deepEqual(f.writes,[{revision:1,notes:saved.notes}]);
 await store.close();const reopened=await opened(t,f);assert.deepEqual(reopened.store.getSnapshot(),saved);
 assert.ok(Object.isFrozen(reopened.store.getSnapshot().notes));
});

test('tuple keys distinguish slash collisions, Unicode normalization, case and special ID strings',async t=>{
 const {store,f}=await opened(t),ids=[['a/b','c'],['a','b/c'],['提供商/命名空间','组织/模型'],['Provider','Model'],['provider','Model'],['é','m'],['e\u0301','m'],['__proto__','constructor'],[' p /','a"\\b'],['p'.repeat(200),'m'.repeat(200)]];
 for(const [index,[provider,model]] of ids.entries())await store.saveNote(provider,model,'note '+index,{expectedRevision:index});
 const saved=store.getSnapshot();assert.equal(Object.keys(saved.notes).length,ids.length);
 for(const [index,[provider,model]] of ids.entries())assert.equal(saved.notes[keyOf(provider,model)],'note '+index);
 await store.close();const reopened=await opened(t,f);assert.deepEqual(reopened.store.getSnapshot(),saved);
});

test('notes validate options, exact bounded IDs and normalized text before any write',async t=>{
 const {store,f}=await opened(t),before=store.getSnapshot();
 for(const options of [undefined,{},null,[],{expectedRevision:-1},{expectedRevision:0.5},{expectedRevision:'0'},{expectedRevision:Number.MAX_SAFE_INTEGER+1},{expectedRevision:0,extra:true},{expectedRevision:0,signal:{}},Object.create({expectedRevision:0})]) {
  await assert.rejects(store.saveNote('p','m','x',options),{code:'invalid-request'});
 }
 for(const id of ['',null,undefined,42,[],{},'x'.repeat(201)]) {
  await assert.rejects(store.saveNote(id,'m','x',{expectedRevision:0}),{code:'invalid-note-key'});
  await assert.rejects(store.saveNote('p',id,'x',{expectedRevision:0}),{code:'invalid-note-key'});
 }
 for(const text of [42,null,undefined,{},'界'.repeat(121)])await assert.rejects(store.saveNote('p','m',text,{expectedRevision:0}),{code:'invalid-note'});
 assert.strictEqual(store.getSnapshot(),before);assert.equal(f.writes.length,0);
 const saved=await store.saveNote('p','m',' \n'+'界'.repeat(120)+'\t ',{expectedRevision:0});assert.equal(saved.notes[keyOf('p','m')].length,120);
});

test('notes CAS rejects a conflicting writer without retry or overwrite and deletion is explicit',async t=>{
 const {store,f}=await opened(t),seen=[];store.subscribe(value=>seen.push(value));
 const results=await Promise.allSettled([store.saveNote('p','m','winner',{expectedRevision:0}),store.saveNote('p','m','loser',{expectedRevision:0})]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].reason.code,'stale-model-notes');
 const saved=store.getSnapshot();assert.equal(saved.notes[keyOf('p','m')],'winner');assert.equal(f.writes.length,1);assert.equal(seen.length,1);
 await assert.rejects(store.saveNote('p','m','winner',{expectedRevision:0}),{code:'stale-model-notes'});
 assert.strictEqual(await store.saveNote('p','m',' winner\n',{expectedRevision:1}),saved);
 assert.strictEqual(await store.saveNote('p','absent','',{expectedRevision:1}),saved);
 const cleared=await store.saveNote('p','m',' \n ',{expectedRevision:1});assert.deepEqual(cleared.notes,{});assert.equal(cleared.notesRevision,2);
 assert.equal(f.writes.length,2);assert.equal(seen.length,2);
});

test('notes have independent profile, flags and controls domains and revisions',async t=>{
 const f=fixture(),{store:a}=await opened(t,f),{store:b}=await opened(t,f,resolve('synthetic-profiles','beta'));
 await a.saveNote('p','m','alpha',{expectedRevision:0});await b.saveNote('p','m','beta',{expectedRevision:0});
 const notes=a.getSnapshot().notes;await a.set('suggest',true);await a.configure('enhance',defaults(),{expectedRevision:0});
 assert.strictEqual(a.getSnapshot().notes,notes);assert.equal(a.getSnapshot().notesRevision,1);
 const before=a.getSnapshot();await a.saveNote('p','m','alpha two',{expectedRevision:1});const after=a.getSnapshot();
 assert.equal(after.revision,before.revision);assert.equal(after.settingsRevision,before.settingsRevision);assert.strictEqual(after.settings,before.settings);
 assert.equal(b.getSnapshot().notes[keyOf('p','m')],'beta');
 assert.deepEqual(f.durable.get(f.specs[0].name),{revision:1,enabled:{suggest:true,enhance:false}});
 assert.deepEqual(Object.keys(f.durable.get(f.specs[1].name)).sort(),['configured','revision','settings']);
 assert.deepEqual(Object.keys(f.durable.get(f.specs[2].name)).sort(),['notes','revision']);
});

test('unavailable notes reject every save while assist flags and controls remain operational',async t=>{
 const f=fixture();f.hooks.open=spec=>{if(isNotes(spec))throw Error('PRIVATE_PATH');};
 const {store}=await opened(t,f),initial=store.getSnapshot();
 assert.deepEqual(initial.notes,{});assert.equal(initial.notesRevision,0);assert.equal(initial.notesAvailable,false);
 for(const text of ['x',''])await assert.rejects(store.saveNote('p','m',text,{expectedRevision:0}),{code:'model-notes-unavailable',message:'model-notes-unavailable'});
 assert.strictEqual(store.getSnapshot(),initial);assert.equal(f.writes.length,0);
 await store.set('enhance',true);await store.configure('enhance',defaults(),{expectedRevision:0});
 assert.equal(store.getSnapshot().enabled.enhance,true);assert.equal(store.getSnapshot().configured.enhance,true);assert.equal(store.getSnapshot().notesAvailable,false);
});

test('corrupt notes are preserved, disabled and their acquired domain is closed on initialization failure',async()=>{
 const key=keyOf('p','m'),base={revision:1,notes:{[key]:'valid'}};
 const invalid=[null,[],{...base,extra:true},{...base,revision:-1},{...base,revision:0.5},{...base,revision:Number.MAX_SAFE_INTEGER+1},{...base,notes:null},{...base,notes:[]},
  ...['p/m','__proto__','["p", "m"]',JSON.stringify(['','m']),JSON.stringify(['p','m','extra']),keyOf('p','x'.repeat(201)),JSON.stringify([4,'m'])].map(key=>({revision:1,notes:{[key]:'x'}})),
  ...['',' leading','two  spaces','multi\nline','x'.repeat(121),42,null].map(text=>({revision:1,notes:{[key]:text}})),
  {revision:1,notes:Object.fromEntries(Array.from({length:501},(_,i)=>[keyOf('p','m'+i),'x']))}];
 for(const record of invalid) {
  const f=seededNotes(record),store=await openProfileStore(f.ctx(),z);
  try {
   assert.equal(store.getSnapshot().notesAvailable,false,JSON.stringify(record));assert.deepEqual(store.getSnapshot().notes,{});
   assert.equal(f.live.size,2);assert.deepEqual(f.closed,[f.specs[2].name]);assert.strictEqual(f.durable.get(f.specs[2].name),record);assert.equal(f.writes.length,0);
   await assert.rejects(store.saveNote('p','m','x',{expectedRevision:0}),{code:'model-notes-unavailable'});
  } finally {await store.close();}
  assert.equal(f.live.size,0);assert.equal(f.closed.filter(name=>name===f.specs[2].name).length,1);
 }
});

test('malformed notes handles and throwing reads release the acquired domain',async()=>{
 for(const global of [{set(){}},{get(){return {}; }},{get(){throw Error('PRIVATE_READ');},set(){}}]) {
  const f=fixture();f.hooks.domain=(domain,spec)=>isNotes(spec)?{...domain,global}:domain;
  const store=await openProfileStore(f.ctx(),z);assert.equal(store.getSnapshot().notesAvailable,false);assert.equal(f.live.size,2);
  assert.deepEqual(f.closed,[f.specs[2].name]);await store.close();assert.equal(f.live.size,0);
 }
});

test('failed notes writes retain the last durable data, disable queued saves and keep controls usable',async t=>{
 const {store,f}=await opened(t);await store.saveNote('p','m','durable',{expectedRevision:0});
 const before=store.getSnapshot(),persisted=structuredClone(f.durable.get(f.specs[2].name)),seen=[];store.subscribe(value=>seen.push(value));
 f.hooks.write=(_value,spec)=>{if(isNotes(spec))throw Error('PRIVATE_WRITE');};
 const results=await Promise.allSettled([store.saveNote('p','m','lost',{expectedRevision:1}),store.saveNote('p','other','lost too',{expectedRevision:1})]);
 for(const result of results) {assert.equal(result.status,'rejected');assert.equal(result.reason.code,'model-notes-unavailable');assert.equal(result.reason.message,'model-notes-unavailable');}
 const after=store.getSnapshot();assert.equal(after.notesAvailable,false);assert.equal(after.notesRevision,1);assert.strictEqual(after.notes,before.notes);
 assert.deepEqual(f.durable.get(f.specs[2].name),persisted);assert.equal(f.writes.length,2);assert.deepEqual(seen,[after]);
 delete f.hooks.write;await assert.rejects(store.saveNote('p','m','durable',{expectedRevision:1}),{code:'model-notes-unavailable'});
 await store.set('enhance',true);await store.configure('enhance',defaults(),{expectedRevision:0});
 await store.close();const reopened=await opened(t,f);assert.equal(reopened.store.getSnapshot().notesAvailable,true);assert.deepEqual(reopened.store.getSnapshot().notes,before.notes);
});

test('notes cancellation before commit writes nothing, started commits publish, and close drains once',{timeout:2000},async t=>{
 const {store,f}=await opened(t),pre=new AbortController();pre.abort();
 await assert.rejects(store.saveNote('p','m','x',{expectedRevision:0,signal:pre.signal}),{name:'AbortError'});assert.equal(f.writes.length,0);
 const started=deferred(),gate=deferred(),controller=new AbortController();f.hooks.write=async()=>{started.resolve();await gate.promise;};
 const seen=[];store.subscribe(value=>seen.push(value));
 const first=store.saveNote('p','m','committed',{expectedRevision:0,signal:controller.signal});await started.promise;
 const queued=store.saveNote('p','other','cancelled',{expectedRevision:1,signal:controller.signal}),rejected=assert.rejects(queued,{name:'AbortError'});
 controller.abort();const closing=store.close();assert.strictEqual(store.close(),closing);
 await assert.rejects(store.saveNote('p','m','later',{expectedRevision:1}),{code:'model-notes-unavailable'});
 gate.resolve();const saved=await first;await rejected;await closing;
 assert.equal(saved.notes[keyOf('p','m')],'committed');assert.equal(saved.notesRevision,1);assert.deepEqual(seen,[saved]);assert.equal(f.writes.length,1);assert.equal(f.live.size,0);
 assert.equal(f.closed.filter(name=>name===f.specs[2].name).length,1);
});

test('close drains accepted notes writers in order without allowing new writes',async()=>{
 const f=fixture(),store=await openProfileStore(f.ctx(),z);
 const first=store.saveNote('p','m','first',{expectedRevision:0}),second=store.saveNote('p','m','second',{expectedRevision:1}),closed=store.close();
 await assert.rejects(store.saveNote('p','m','third',{expectedRevision:2}),{code:'model-notes-unavailable'});
 assert.equal((await first).notesRevision,1);assert.equal((await second).notesRevision,2);await closed;
 assert.equal(f.durable.get(f.specs[2].name).notes[keyOf('p','m')],'second');assert.equal(f.live.size,0);
});

test('500-note cap permits edits and deletions and rejects only a new entry',async t=>{
 const notes=Object.fromEntries(Array.from({length:500},(_,i)=>[keyOf('p','m'+i),'x'])),{store,f}=await opened(t,seededNotes({revision:7,notes}));
 const before=store.getSnapshot();await assert.rejects(store.saveNote('p','new','x',{expectedRevision:7}),{code:'too-many-model-notes'});
 assert.strictEqual(store.getSnapshot(),before);assert.equal(f.writes.length,0);assert.equal(before.notesAvailable,true);
 await store.saveNote('p','m0','changed',{expectedRevision:7});await store.saveNote('p','m1','',{expectedRevision:8});await store.saveNote('p','new','new',{expectedRevision:9});
 assert.equal(Object.keys(store.getSnapshot().notes).length,500);assert.equal(store.getSnapshot().notesRevision,10);
});

test('exhausted notes revisions never overflow or report a successful write',async t=>{
 const key=keyOf('p','m'),{store,f}=await opened(t,seededNotes({revision:Number.MAX_SAFE_INTEGER,notes:{[key]:'same'}}));
 assert.strictEqual(await store.saveNote('p','m','same',{expectedRevision:Number.MAX_SAFE_INTEGER}),store.getSnapshot());
 await assert.rejects(store.saveNote('p','m','changed',{expectedRevision:Number.MAX_SAFE_INTEGER}),{code:'model-notes-unavailable'});
 assert.equal(store.getSnapshot().notesRevision,Number.MAX_SAFE_INTEGER);assert.equal(store.getSnapshot().notesAvailable,false);assert.equal(f.writes.length,0);
});

test('notes observer failures do not undo commits and notes close errors still close flags and controls',async()=>{
 const f=fixture(),store=await openProfileStore(f.ctx(),z);let calls=0;store.subscribe(()=>calls++)();
 store.subscribe(()=>{throw Error('observer');});store.subscribe(async()=>{throw Error('async observer');});
 await store.saveNote('p','m','x',{expectedRevision:0});assert.equal(calls,0);
 f.hooks.close=spec=>{if(isNotes(spec))throw Error('PRIVATE_CLOSE');};
 await assert.rejects(store.close(),{code:'model-notes-unavailable',message:'model-notes-unavailable'});assert.equal(f.live.size,0);assert.equal(f.closed.length,3);
});
