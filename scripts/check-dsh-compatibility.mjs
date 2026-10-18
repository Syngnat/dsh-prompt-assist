import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import semver from 'semver';
import {installFastBridge} from '../bridge-v2.js';
import {DEFAULT_PROVIDERS} from '../policy.js';
const manifest=resolve(process.argv[2]??'.compat-runtime/node_modules/@deepseek-ai/dsh/package.json');
const sdk=JSON.parse(readFileSync(manifest,'utf8'));
const plugin=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
assert.ok(semver.satisfies(sdk.version,plugin.engines.dsh,{includePrerelease:true}));
const requireSdk=createRequire(realpathSync(manifest));
const adapter=await import(pathToFileURL(requireSdk.resolve('@deepseek-ai/dsh-llm-pi-ai')).href);
const boot=await import(pathToFileURL(requireSdk.resolve('@deepseek-ai/dsh-app-boot')).href);
assert.equal(typeof boot.resolvePluginResource,'function');
const original=adapter.PiAiAdapter.prototype.streamWithSnapshot;
const restore=installFastBridge(adapter.PiAiAdapter,()=>false,DEFAULT_PROVIDERS);
assert.notEqual(adapter.PiAiAdapter.prototype.streamWithSnapshot,original);
restore();assert.equal(adapter.PiAiAdapter.prototype.streamWithSnapshot,original);
console.log('Real DSH adapter/boot contract verified:',sdk.version,'; model calls: 0');

// Native call preparation + an offline adapter: no provider/network/model execution.
const llmEntry=requireSdk.resolve('@deepseek-ai/dsh-llm');
const requireLlm=createRequire(llmEntry);
const {Context}=await import(pathToFileURL(requireLlm.resolve('@deepseek-ai/cordis')).href);
const {LlmRuntime,LlmAdapter,createUserMessage}=await import(pathToFileURL(llmEntry).href);
const {callAssistModel}=await import('../assist/model-call.js');
const {estimateMessage}=await import(pathToFileURL(requireSdk.resolve('@deepseek-ai/dsh-token-meter/estimate')).href);
const root=new Context();
try{
 const fiber=root.plugin(LlmRuntime);await fiber.await();assert.equal(typeof root.get('llm')?.prepareCall,'function');
 const observed=[];
 class OfflineBudgetAdapter extends LlmAdapter{
  async resolveModel(provider,id){return {provider,id,name:id,context:{contextWindow:1000000},...(id==='provider-default'?{}:{defaultMaxTokens:16384}),reasoning:{defaultEffort:'high',efforts:[{id:'high',name:'High'}]}};}
  async *stream(options){observed.push(options);yield {type:'text-delta',index:0,text:'Complete offline enhancement.'};yield {type:'finish',reason:{kind:'stop'}};}
 }
 root.llm.registerAdapter(['budget-contract'],new OfflineBudgetAdapter());
 const result=await callAssistModel({llm:root.llm,tokenMeter:{estimateMessage}},{id:'budget-contract'},{provider:'budget-contract',model:'fixture',metadata:{context:{contextWindow:1000000},defaultMaxTokens:512},reasoningEffort:'high',fast:false},{system:'test',user:'test'},'enhance',undefined,createUserMessage);
 assert.equal(observed.length,1);assert.equal(observed[0].maxTokens,16384);assert.equal(observed[0].reasoningEffort,'high');assert.equal(result.outputBudgetTokens,16384);
 const longInput='汉'.repeat(100000);
 const longResult=await callAssistModel({llm:root.llm,tokenMeter:{estimateMessage}},{id:'budget-contract'},{provider:'budget-contract',model:'fixture',metadata:{},fast:false},{system:'test',user:longInput},'enhance',undefined,createUserMessage);
 assert.equal(observed.at(-1).messages[0].content[0].text,longInput);assert.ok(longResult.inputTokensEstimate<1000000);assert.ok(longResult.inputTokensEstimate!==Buffer.byteLength('test'+longInput));
 const defaults=await callAssistModel({llm:root.llm,tokenMeter:{estimateMessage}},{id:'budget-contract'},{provider:'budget-contract',model:'provider-default',metadata:{},fast:false},{system:'test',user:'test'},'enhance',undefined,createUserMessage);
 assert.equal(observed.at(-1).maxTokens,undefined);assert.equal(defaults.outputBudgetTokens,null);
 console.log('Native auxiliary budget preparation verified:',sdk.version,'; external model calls: 0');
}finally{await root.fiber.dispose();}
