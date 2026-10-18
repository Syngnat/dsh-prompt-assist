import test from 'node:test';
import assert from 'node:assert/strict';
import {assertRuntimeContract} from '../runtime-contract.js';
const fixture=()=>({storageDomain:{open(){}},llm:{resolveModelInfo(){},prepareCall(){}},connection:{fetch:{register(){}}},sessionProjections:{register(){},stateOf(){}},commands:{register(){},execute(){}},agents:{get(){},withInitiator(){}},tools:{register(){}}});
test('supported capability shape passes without relying on a DSH version string',()=>assert.doesNotThrow(()=>assertRuntimeContract(fixture())));
for(const [service,method] of [['storageDomain','open'],['llm','prepareCall'],['commands','execute'],['agents','withInitiator']])test('missing '+service+'.'+method+' fails with the precise capability',()=>{const ctx=fixture();delete ctx[service][method];assert.throws(()=>assertRuntimeContract(ctx),e=>e.code==='unsupported-host-capability'&&e.message.includes(service+'.'+method));});
test('missing nested transport fails before any mount side effect',()=>{const ctx=fixture();ctx.connection.fetch={};assert.throws(()=>assertRuntimeContract(ctx),e=>e.message.includes('connection.fetch.register'));});
