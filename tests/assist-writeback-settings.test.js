import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DEFAULT_SETTINGS,sessionSettings,configKey,validateSettings} from '../assist/client/api.js';
import {normalizeEnablement,mergeGlobalSettings} from '../assist/client/enablement-source.js';
import {dictionaries} from '../assist/client/messages.js';
import {Settings} from '../assist/client/settings.js';
import {normalizeConfig} from '../assist/config.js';
import {openProfileStore} from '../assist/profile-store.js';

const WRITEBACK = ['autoApply','streamWrite'];
const complete = patch => ({followSession:true,provider:'',model:'',reasoningEffort:'',fast:false,rounds:1,autoApply:true,streamWrite:false,...patch});
/** The legacy wire view predates the write-back switches and must keep loading. */
const legacySettings = () => ({followSession:true,provider:'',model:'',reasoningEffort:'',fast:false,rounds:1});
const wire = (settings=legacySettings()) => ({scope:'profile',revision:2,enabled:{suggest:true,enhance:true},settingsRevision:3,
  settings:{suggest:settings,enhance:settings},configured:{suggest:true,enhance:true}});

test('write-back switches default to on for both switches when a record omits them',()=>{
  assert.equal(sessionSettings({}).autoApply,true);
  assert.equal(sessionSettings({}).streamWrite,true);
  assert.equal(sessionSettings().autoApply,true);
  for(const feature of ['suggest','enhance']){
    const merged=mergeGlobalSettings({[feature]:{}},{connected:true,data:{settings:{[feature]:legacySettings()},configured:{[feature]:true},enabled:{[feature]:true}}});
    assert.equal(merged[feature].autoApply,true,feature);
    assert.equal(merged[feature].streamWrite,true,feature);
    assert.equal(merged[feature].enabled,true,feature);
  }
  const accepted=normalizeEnablement(wire());
  assert.equal(accepted.settings.enhance.autoApply,true);
  assert.equal(accepted.settings.enhance.streamWrite,true);
  assert.equal(normalizeConfig({}).autoApply,true);
  assert.equal(normalizeConfig({}).streamWrite,true);
});

test('explicit write-back values survive normalization and are never coerced back to defaults',()=>{
  assert.deepEqual(WRITEBACK.map(key=>sessionSettings({autoApply:false,streamWrite:true})[key]),[false,true]);
  assert.deepEqual(WRITEBACK.map(key=>sessionSettings({autoApply:true,streamWrite:false})[key]),[true,false]);
  // Only real booleans count; null, numbers and strings fall back to the profile default.
  for(const bogus of [null,0,1,'true',{},[]]){
    assert.equal(sessionSettings({autoApply:bogus,streamWrite:bogus}).autoApply,true);
    assert.equal(sessionSettings({autoApply:bogus,streamWrite:bogus}).streamWrite,true);
  }
  const accepted=normalizeEnablement(wire({...legacySettings(),autoApply:false,streamWrite:true}));
  assert.equal(accepted.settings.enhance.autoApply,false);
  assert.equal(accepted.settings.enhance.streamWrite,true);
  assert.equal(mergeGlobalSettings({}, {connected:true,data:{settings:{enhance:{...legacySettings(),autoApply:false,streamWrite:true}},configured:{enhance:true},enabled:{enhance:true}}}).enhance.autoApply,false);
});

test('a present but non-boolean write-back field is rejected while an absent one stays valid',()=>{
  assert.throws(()=>normalizeEnablement(wire({...legacySettings(),autoApply:'on'})),{code:'transport-invalid-response'});
  assert.throws(()=>normalizeEnablement(wire({...legacySettings(),streamWrite:1})),{code:'transport-invalid-response'});
  assert.throws(()=>normalizeEnablement(wire({...legacySettings(),streamWrite:null})),{code:'transport-invalid-response'});
  assert.doesNotThrow(()=>normalizeEnablement(wire()));
  assert.throws(()=>normalizeConfig({autoApply:'on'}),{code:'invalid-auto-apply'});
  assert.throws(()=>normalizeConfig({streamWrite:1}),{code:'invalid-stream-write'});
});

/** configKey serializes every DEFAULT_SETTINGS field for both features, write-back switches included. */
const configCount = value => JSON.parse(value).reduce((total,fields) => total+fields.length,0);
test('configKey changes with either write-back switch so in-flight results invalidate',()=>{
  const base={suggest:sessionSettings(),enhance:sessionSettings()};
  const key=configKey(base);
  assert.notEqual(configKey({...base,enhance:{...base.enhance,autoApply:false}}),key);
  assert.notEqual(configKey({...base,enhance:{...base.enhance,streamWrite:false}}),key);
  assert.notEqual(configKey({...base,enhance:{...base.enhance,autoApply:false,streamWrite:true}}),key);
  // An unchanged snapshot keeps its identity, and a suggest record alone never shifts the enhance key.
  assert.equal(configKey({...base,enhance:{...base.enhance,streamWrite:true}}),key);
  assert.equal(configCount(key),Object.keys(DEFAULT_SETTINGS).length*2);
});

test('validateSettings never reports the write-back switches and keeps every existing verdict',()=>{
  assert.equal(validateSettings({...DEFAULT_SETTINGS,autoApply:false,streamWrite:true}),null);
  assert.equal(validateSettings({...DEFAULT_SETTINGS,autoApply:'on',streamWrite:7}),null);
  assert.equal(validateSettings({...DEFAULT_SETTINGS,rounds:0,autoApply:false}),'rounds');
  assert.equal(DEFAULT_SETTINGS.autoApply,true);
  assert.equal(DEFAULT_SETTINGS.streamWrite,true);
});

const renderForm = (feature,t,config) => renderToStaticMarkup(React.createElement(Settings,{t,feature,config:sessionSettings(config),catalog:{providers:[],models:[]},allowed:true,onChange(){},save(){}}));

test('the enhance form renders both switches from the persisted draft in both languages',()=>{
  for(const lang of ['zh','en']){
    const t=key=>dictionaries[lang][key];
    for(const key of ['autoApply','autoApplyHint','streamWrite','streamWriteHint'])assert.equal(typeof dictionaries[lang][key],'string',lang+':'+key);
    const off=renderForm('enhance',t,{autoApply:false,streamWrite:true});
    const inputs=off.match(/<input[^>]*>/g)??[];
    assert.equal(inputs.length,4);
    for(const key of ['autoApply','autoApplyHint','streamWrite','streamWriteHint'])assert.ok(off.includes(t(key)),lang+':'+key);
    // follow, fast, autoApply, streamWrite — the draft, not a hardcoded default, decides the boxes.
    assert.match(inputs[2],/type="checkbox"/);assert.doesNotMatch(inputs[2],/checked=""/);
    assert.match(inputs[3],/type="checkbox"/);assert.match(inputs[3],/checked=""/);
    const defaults=(renderForm('enhance',t,{}).match(/<input[^>]*>/g)??[]);
    assert.match(defaults[2],/checked=""/);assert.match(defaults[3],/checked=""/);
  }
});

test('the suggest card keeps its original controls and never offers a write-back switch',()=>{
  for(const lang of ['zh','en']){
    const t=key=>dictionaries[lang][key];
    const suggest=renderForm('suggest',t,{});
    for(const key of ['autoApply','autoApplyHint','streamWrite','streamWriteHint'])assert.ok(!suggest.includes(t(key)),lang+':'+key);
    assert.equal((suggest.match(/<input[^>]*>/g)??[]).length,2,'follow and fast only');
    assert.ok(suggest.includes(t('follow')));
    assert.ok(suggest.includes(t('fast')));
    assert.match(suggest,/<select>/,'the rounds control stays in place');
    // A card rendered without a feature (legacy SSR callers) stays write-back free as well.
    assert.ok(!renderForm(undefined,t,{}).includes(t('autoApply')));
  }
});

/** A zod-compatible strict reader, mirroring how the Host storage facade validates records. */
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
  // Like zod, an absent optional key is omitted from the parsed record instead of becoming undefined.
  object: shape => new Schema(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(shape,key))) throw Error('schema');
    const parsed={};
    for(const [key,schema] of Object.entries(shape)){const field=schema.parse(value[key]);if(field!==undefined||Object.hasOwn(value,key))parsed[key]=field;}
    return parsed;
  }) };

function storage(legacy=false) {
  const durable=new Map();
  return {durable,async open(spec) {
    // Only the controls domain predates the feature; the flag domains keep their strict record shape.
    if (legacy && spec.name.startsWith('local_prompt_assist_controls_')) spec={...spec,global:{...spec.global,initial:{...spec.global.initial,
      settings:{suggest:legacySettings(),enhance:legacySettings()}}}};
    let record=structuredClone(durable.get(spec.name)??spec.global.initial);
    return {global:{get:()=>record,async set(value){record=value;durable.set(spec.name,structuredClone(value));}},async close(){}};
  }};
}
const ctx = facility => ({get:name => name==='storageDomain'?facility:name==='profileContext'?{dir:'/tmp/synthetic-profile-writeback'}:undefined});

test('host persistence round-trips both switches and keeps pre-upgrade records loadable',async()=>{
  const facility=storage(true),store=await openProfileStore(ctx(facility),z);
  const legacy=store.getSnapshot();
  // A record written before this feature has no switch keys at all: defaults merge, nothing is invalid.
  assert.equal(legacy.settings.enhance.autoApply,true);
  assert.equal(legacy.settings.enhance.streamWrite,true);
  assert.equal(legacy.settings.suggest.streamWrite,true);
  await assert.rejects(store.configure('enhance',complete({autoApply:'on'}),{expectedRevision:legacy.settingsRevision}),{code:'invalid-auto-apply'});
  const saved=await store.configure('enhance',complete({rounds:3,autoApply:false,streamWrite:true}),{expectedRevision:legacy.settingsRevision});
  assert.equal(saved.settings.enhance.autoApply,false);
  assert.equal(saved.settings.enhance.streamWrite,true);
  assert.equal(saved.settings.enhance.rounds,3);
  assert.equal(saved.settings.suggest.autoApply,true,'suggest keeps its own record');
  assert.equal(saved.configured.enhance,true);
  // Identical switch values are a no-op, so a redundant save never bumps the revision.
  const again=await store.configure('enhance',complete({rounds:3,autoApply:false,streamWrite:true}),{expectedRevision:saved.settingsRevision});
  assert.strictEqual(again,saved);
  await store.close();
  const reopened=await openProfileStore(ctx(facility),z);
  const readBack=reopened.getSnapshot();
  assert.equal(readBack.settings.enhance.autoApply,false);
  assert.equal(readBack.settings.enhance.streamWrite,true);
  assert.equal(readBack.settings.enhance.rounds,3);
  assert.equal(readBack.configured.enhance,true);
  await reopened.close();
});
