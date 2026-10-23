import test from 'node:test';
import assert from 'node:assert/strict';
import { installAssistRoute } from '../assist/transport.js';
function scope(routes) {
 const effects=[];
 return { effect(start){const stop=start();effects.push(stop);return stop;},dispose(){for(const stop of effects.reverse())stop?.();}, webServer:{register(route){if(routes.has(route.path))throw Error('duplicate exact route');routes.set(route.path,route);return()=>routes.delete(route.path);}},connection:{requestRejection(){return undefined;}}};
}
test('owned route disappears on scope disposal and can be registered again',()=>{
 const routes=new Map();const first=scope(routes);installAssistRoute(first,{});assert.equal(routes.size,1);
 first.dispose();assert.equal(routes.size,0,'returned route disposer must be owned by the plugin scope');
 const next=scope(routes);installAssistRoute(next,{});assert.equal(routes.size,1);next.dispose();assert.equal(routes.size,0);
});

import { installAssistHost } from '../assist/bootstrap.js';
import { AssistRuntime } from '../assist/runtime.js';
import { ASSIST_KEY, ASSIST_COMMAND, LEGACY_KEY, LEGACY_COMMAND } from '../assist/identity.js';
import { foldContextState } from '../assist/context.js';
import { normalizeConfig } from '../assist/config.js';
test('retired handler sees only disabled tombstone; its config command is reject-only',async()=>{
 const routes=new Map([['/local-openai-fast/assist',{retired:true}]]), units=new Map(), commands=new Map();
 let registeredTool;const ctx=scope(routes);ctx.on=()=>{};ctx.tools={register(value){registeredTool=value;}};ctx.profileContext={dir:process.cwd()};ctx.get=name=>ctx[name];ctx.storageDomain={async open(spec){let value=spec.name.startsWith('local_prompt_assist_controls')?{...spec.global.initial,configured:{suggest:false,enhance:false}}:spec.global.initial;return {global:{get:()=>value,set:async next=>{value=next;}},close:async()=>{}};}};
 ctx.connection.fetch={register(route){return ctx.effect(()=>{routes.set(route.path,route);return()=>routes.delete(route.path);});}};
 ctx.sessionProjections={register(unit){ctx.effect(()=>{units.set(unit.key,unit);return()=>units.delete(unit.key);});}};
 ctx.commands={register(command){ctx.effect(()=>{commands.set(command.name,command);return()=>commands.delete(command.name);});}};
 let streams=0;ctx.llm={prepareCall(){streams++;throw Error('must not dispatch');}};
 const chain={int(){return this;},min(){return this;},max(){return this;},nullable(){return this;},strict(){return this;},refine(){return this;},parse(value){return value;}};
 const z={any:()=>chain,object:()=>chain,string:()=>chain,boolean:()=>chain,number:()=>chain};
 const fast={selection:()=>({provider:'openai',model:'gpt-test'}),enabled:()=>true};
 const service=await installAssistHost(ctx,{z,fastService:fast,providers:['openai'],createUserMessage:value=>value});
 assert.equal(units.get(ASSIST_KEY).stateVersion,2);assert.equal(units.get(LEGACY_KEY).stateVersion,2);assert.equal(units.get(LEGACY_KEY).wire,undefined);
 const locked=units.get(LEGACY_KEY).init();assert.equal(locked.settings.enhance.enabled,false);assert.equal(locked.busy,true);assert.equal(locked.rounds.length,0);
 assert.equal(units.get(LEGACY_KEY).apply(locked,{type:'anything'}),locked);
 const legacy=new AssistRuntime(ctx,fast,['openai'],value=>value);legacy.projection=()=>locked;
 await assert.rejects(legacy.generate({id:'a'},{feature:'enhance',draft:'text',draftRev:1},{}),{code:'global-settings-unavailable'});
 assert.equal(commands.get(LEGACY_COMMAND).handler().kind,'error');assert.ok(commands.has(ASSIST_COMMAND));assert.ok(units.has(ASSIST_KEY));assert.equal(streams,0);
 let replay=units.get(ASSIST_KEY).init({},0);const config=normalizeConfig({rounds:3});
 replay=foldContextState(replay,{type:'command/run',seq:1,data:{name:LEGACY_COMMAND,commandId:'old',args:JSON.stringify({feature:'enhance',config})}});
 replay=foldContextState(replay,{type:'command/done',seq:2,data:{commandId:'old',kind:'success'}});assert.equal(replay.settings.enhance.rounds,1);
 // A V1 run pending at migration and its late success never enter V2 pending/settings.
 assert.deepEqual(replay.pending,{});
 assert.ok(registeredTool.parameters.properties.action.enum.includes('set-enabled'));assert.equal(registeredTool.parameters.properties.config.properties.enabled,undefined);assert.equal(registeredTool.parameters.properties.enabled.type,'boolean');
 const changed=await registeredTool.execute({action:'set-enabled',feature:'enhance',enabled:true},{agent:{session:{header:{}}},signal:new AbortController().signal});assert.equal(changed.enabled.enhance,true);assert.equal((await service.dispatch({action:'enablement'})).revision,changed.revision);
 assert.equal(changed.configured.enhance,false,'legacy enabled flag does not confirm any old session model');
  const before=service.globalEnablement();
  assert.deepEqual(commands.get(ASSIST_COMMAND).handler(),{kind:'error',text:'global-config-required'});
  assert.equal(commands.get(ASSIST_COMMAND).recordInput,false);
  assert.strictEqual(service.globalEnablement(),before,'retired command cannot write profile settings');
  const configGlobal={followSession:true,provider:'',model:'',reasoningEffort:'',fast:false,rounds:3};
  const saved=await registeredTool.execute({action:'configure',feature:'enhance',config:configGlobal},{agent:{session:{header:{}}},signal:new AbortController().signal});
  assert.deepEqual(saved.settings.enhance,configGlobal);assert.equal(saved.settingsRevision,1);assert.equal(saved.configured.enhance,true);
  assert.equal(saved.revision,before.revision);assert.deepEqual(saved.enabled,before.enabled);assert.equal(streams,0);
  await assert.rejects(registeredTool.execute({action:'configure',feature:'suggest',config:configGlobal},{agent:{session:{header:{origin:'subagent'}}},signal:new AbortController().signal}),{code:'forbidden'});
  assert.match(registeredTool.description,/profile-wide/);assert.match(registeredTool.parameters.properties.config.description,/existing and future conversations/);
  assert.equal(routes.size,4);ctx.dispose();assert.equal(routes.size,1);assert.equal(units.size,0);assert.equal(commands.size,0);
});
