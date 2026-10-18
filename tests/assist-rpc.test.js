import test from 'node:test';
import assert from 'node:assert/strict';
import { installAssistRpc, createAssistRpcApi } from '../assist/rpc-transport.js';
import { trustedRequest } from '../assist/transport.js';
import { ASSIST_CHANNEL, ASSIST_ENDPOINT } from '../assist/identity.js';
const owner={principal:{kind:'owner'}};
function fixture(){
 let route;const calls=[];const reads=[];
 const ctx={connection:{fetch:{register(value){route=value;assert.equal(route.path,ASSIST_CHANNEL+'/'+ASSIST_ENDPOINT);return()=>{route=undefined;};}}}};
 const service={async dispatch(input,options){calls.push({input,options});return {settings:{suggest:{enabled:false},enhance:{enabled:false}}};},errorCode:()=> 'model-failed',noteTransportRead:id=>reads.push(id)};
 const dispose=installAssistRpc(ctx,service);
 const handle=async(endpoint,input,signal,peer)=>{
  if(peer.principal.kind!=='owner')return {ok:false,error:{code:'forbidden'}};
  const request=new Request('http://dsh.internal'+route.path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'r1',method:endpoint,payload:input}),signal});
  const response=await route.fetch(request);const envelope=await response.json();
  if(!response.ok)return {ok:false,error:{code:envelope.error}};
  assert.equal(envelope.rpcId,'r1');return envelope.result;
 };
 const connection={rpc:{call(channel,endpoint,input,signal=new AbortController().signal){assert.equal(channel,ASSIST_CHANNEL);return handle(endpoint,input,signal,owner);}}};
 return {ctx,service,calls,reads,dispose,connection,handle};
}
test('legacy extra Origin gate rejects an otherwise authenticated shell request',()=>{
 assert.equal(trustedRequest({connection:{requestRejection:()=>undefined}},{socket:{remoteAddress:'127.0.0.1'},headers:{host:'127.0.0.1:5038'}}),false);
});
test('desktop uses native carrier without direct fetch, cookies or a hard-coded Host port',async()=>{
 const f=fixture();const saved=globalThis.fetch;globalThis.fetch=()=>{throw Error('desktop page direct fetch must not run');};
 try{const api=createAssistRpcApi(f.connection);const value=await api('state','session-a');assert.equal(value.settings.enhance.enabled,false);assert.deepEqual(f.reads,['session-a']);assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.fromUI,true);}finally{globalThis.fetch=saved;f.dispose();}
});
test('non-owner and unknown endpoint cannot dispatch or read files',async()=>{
 const f=fixture();const signal=new AbortController().signal;
 assert.equal((await f.handle(ASSIST_ENDPOINT,{},signal,{principal:{kind:'guest'}})).error.code,'forbidden');
 assert.equal((await f.handle('other',{},signal,owner)).error.code,'invalid-request');assert.equal(f.calls.length,0);
});
test('shared RPC preserves request identity and cancellation without sending chat commands',async()=>{
 const f=fixture();const controller=new AbortController();const api=createAssistRpcApi(f.connection);
 await api('model','session-b',{provider:'cpa',model:'gpt-test'},controller.signal);
 assert.deepEqual(f.calls[0].input,{action:'model',sessionId:'session-b',provider:'cpa',model:'gpt-test'});assert.equal(f.calls[0].options.signal.aborted,false);
 controller.abort();await assert.rejects(api('state','session-b',{},controller.signal),{code:'cancelled'});assert.equal(f.calls.length,1);
});
test('server errors and carrier failures do not expose upstream details',async()=>{
 const f=fixture();f.service.dispatch=()=>{throw Error('private-secret-detail');};
 await assert.rejects(createAssistRpcApi(f.connection)('state','a'),e=>e.code==='model-failed'&&!e.message.includes('private'));
 await assert.rejects(createAssistRpcApi({rpc:{call(){throw Error('token=SECRET');}}})('state','a'),e=>e.code==='transport-unavailable'&&!e.message.includes('SECRET'));
});
test('large authenticated payload reaches model admission without an extra plugin text cap',async()=>{const f=fixture(),draft='字'.repeat(500000);await createAssistRpcApi(f.connection)('generate','a',{draft});assert.equal(f.calls.length,1);assert.equal(f.calls[0].input.draft,draft);});
