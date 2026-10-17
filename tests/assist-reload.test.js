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
 const ctx=scope(routes);ctx.on=()=>{};ctx.tools={register(){}};
 ctx.connection.fetch={register(route){return ctx.effect(()=>{routes.set(route.path,route);return()=>routes.delete(route.path);});}};
 ctx.sessionProjections={register(unit){ctx.effect(()=>{units.set(unit.key,unit);return()=>units.delete(unit.key);});}};
 ctx.commands={register(command){ctx.effect(()=>{commands.set(command.name,command);return()=>commands.delete(command.name);});}};
 let streams=0;ctx.llm={prepareCall(){streams++;throw Error('must not dispatch');}};
 const chain={int(){return this;},min(){return this;},max(){return this;},nullable(){return this;}};
 const z={any:()=>chain,object:()=>chain,string:()=>chain,boolean:()=>chain,number:()=>chain};
 const fast={selection:()=>({provider:'openai',model:'gpt-test'}),enabled:()=>true};
 await installAssistHost(ctx,{z,fastService:fast,providers:['openai'],createUserMessage:value=>value});
 assert.equal(units.get(LEGACY_KEY).stateVersion,2);assert.equal(units.get(LEGACY_KEY).wire,undefined);
 const locked=units.get(LEGACY_KEY).init();assert.equal(locked.settings.enhance.enabled,false);assert.equal(locked.busy,true);assert.equal(locked.rounds.length,0);
 assert.equal(units.get(LEGACY_KEY).apply(locked,{type:'anything'}),locked);
 const legacy=new AssistRuntime(ctx,fast,['openai'],value=>value);legacy.projection=()=>locked;
 await assert.rejects(legacy.generate({id:'a'},{feature:'enhance',draft:'text',draftRev:1},{}),{code:'disabled'});
 assert.equal(commands.get(LEGACY_COMMAND).handler().kind,'error');assert.ok(commands.has(ASSIST_COMMAND));assert.ok(units.has(ASSIST_KEY));assert.equal(streams,0);
 let replay=units.get(ASSIST_KEY).init({},0);const config=normalizeConfig({rounds:3});
 replay=foldContextState(replay,{type:'command/run',seq:1,data:{name:LEGACY_COMMAND,commandId:'old',args:JSON.stringify({feature:'enhance',config})}});
 replay=foldContextState(replay,{type:'command/done',seq:2,data:{commandId:'old',kind:'success'}});assert.equal(replay.settings.enhance.rounds,1);
 // A V1 run pending at migration and its late success never enter V2 pending/settings.
 assert.deepEqual(replay.pending,{});
 assert.equal(routes.size,3);ctx.dispose();assert.equal(routes.size,1);assert.equal(units.size,0);assert.equal(commands.size,0);
});
