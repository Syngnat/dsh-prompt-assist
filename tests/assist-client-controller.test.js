import test from "node:test";
import assert from "node:assert/strict";
import {createAssistController} from "../assist/client/controller.js";
import {DEFAULT_SETTINGS,createAssistApi,validateSettings,selectedFileOf,referenceNames,reconcileState,catalogInput,cleanDraftConfigs} from "../assist/client/api.js";
import {captureText,applyText,undoText,createViewStore,ownsResult} from "../assist/client/editor.js";
import {dictionaries} from "../assist/client/messages.js";
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture(extra={}){
 let input={draft:"",draftRev:1,occurrences:[],attachmentIds:[],phase:"plain"};
 let frame={sessionId:"session-a",qaId:"1:2",busy:false,paused:false,routeKey:"route-a",settings:{suggest:{...DEFAULT_SETTINGS,enabled:true},enhance:{...DEFAULT_SETTINGS,enabled:true}},input,...extra};
 const requests=[],changes=[],edits=[];
 const actions={captureInsertion:()=>({start:input.draft.length,end:input.draft.length,draftRev:input.draftRev}),insertText:(text,span)=>{edits.push({text,span});if(input.draftRev!==span.draftRev)return false;assert.equal(span.start,0);assert.equal(span.end,input.draft.length);input={...input,draft:text,draftRev:input.draftRev+1};return true;}};
 const controller=createAssistController({actions:()=>actions,publish:value=>changes.push(value),requestId:()=>String(requests.length),send:(action,sessionId,payload,signal)=>{const wait=deferred();requests.push({action,sessionId,payload,signal,wait});return wait.promise;}});
 const observe=(patch={})=>{frame={...frame,...patch,input};controller.observe(frame);};
 const type=(patch)=>{input={...input,...patch};observe();};
 const reply=(index=0,patch={})=>{const request=requests[index];request.wait.resolve({original:request.payload.draft,draftRev:request.payload.draftRev,qaId:request.payload.qaId,feature:request.payload.feature,text:"Result",structured:false,...patch});};
 return {controller,actions,requests,changes,edits,observe,type,reply,get input(){return input;},get frame(){return frame;}};
}

test("mount only establishes a QA baseline and a NEW QA generates once",async()=>{
 const f=fixture();f.observe();assert.equal(f.requests.length,0);
 f.observe({qaId:"3:4"});assert.equal(f.requests.length,1);
 f.observe();assert.equal(f.requests.length,1);
 f.reply();await tick();assert.equal(f.changes.at(-1).preview.text,"Result");f.controller.dispose();
});
test("undefined projection waits for authoritative baseline, including empty QA",()=>{
 const f=fixture();f.observe({qaId:undefined});f.observe({qaId:null});assert.equal(f.requests.length,0);
 f.observe({qaId:"3:4"});assert.equal(f.requests.length,1);f.controller.dispose();
});
test("disabled/unconfigured never request; enable does not replay old QA",()=>{
 const f=fixture({settings:{suggest:{...DEFAULT_SETTINGS},enhance:{...DEFAULT_SETTINGS}}});f.observe();f.observe({qaId:"3:4"});
 f.observe({settings:{suggest:{...DEFAULT_SETTINGS,enabled:true},enhance:DEFAULT_SETTINGS}});assert.equal(f.requests.length,0);
 f.observe({qaId:"5:6"});assert.equal(f.requests.length,1);f.controller.dispose();
 const g=fixture({settings:{suggest:{...DEFAULT_SETTINGS,enabled:true,followSession:false},enhance:DEFAULT_SETTINGS}});g.observe();g.observe({qaId:"3:4"});assert.equal(g.requests.length,0);g.controller.dispose();
});
test("new QA while busy waits for idle but never repeats",()=>{
 const f=fixture();f.observe();f.observe({qaId:"3:4",busy:true});assert.equal(f.requests.length,0);
 f.observe({busy:false});assert.equal(f.requests.length,1);f.observe({busy:true});f.observe({busy:false});assert.equal(f.requests.length,1);f.controller.dispose();
});
test("typing cancels request and ignores late reply even if draft returns to same text",async()=>{
 const f=fixture();f.observe();f.observe({qaId:"3:4"});f.type({draft:"x",draftRev:2});assert.equal(f.requests[0].signal.aborted,true);
 f.type({draft:"",draftRev:3});f.reply();await tick();assert.equal(f.changes.at(-1).preview,null);assert.equal(f.requests.length,1);f.controller.dispose();
});
for(const [name,patch] of [["new QA",{qaId:"5:6"}],["session",{sessionId:"other"}],["route",{routeKey:"new-model"}],["configuration",{settings:{suggest:{...DEFAULT_SETTINGS,enabled:false},enhance:DEFAULT_SETTINGS}}],["unsaved configuration",{paused:true}]]){
 test(name+" cancels the previous generation",async()=>{const f=fixture();f.observe();f.observe({qaId:"3:4"});f.observe(patch);assert.equal(f.requests[0].signal.aborted,true);f.reply();await tick();assert.equal(f.changes.at(-1).preview,null);f.controller.dispose();});
}
test("attachments/references/nonempty draft block auto; clearing does not replay",()=>{
 for(const patch of [{attachmentIds:["a"]},{occurrences:[{label:"file"}]},{draft:" "},{phase:"claimed",claim:{}}]){
  const f=fixture();f.type(patch);f.observe({qaId:"3:4"});assert.equal(f.requests.length,0);f.type({attachmentIds:[],occurrences:[],draft:"",phase:"plain",claim:undefined,draftRev:2});assert.equal(f.requests.length,0);f.controller.dispose();
 }
});
test("manual enhancement remains user driven; edit/config/disposal invalidate",async()=>{
 const f=fixture();f.type({draft:"Write tests"});assert.equal(f.requests.length,0);
 const pending=f.controller.generate("enhance");assert.equal(f.requests.length,1);assert.equal(f.input.draft,"Write tests");
 f.controller.configurationEdited();assert.equal(f.requests[0].signal.aborted,true);f.reply();await pending;assert.equal(f.changes.at(-1).preview,null);
 const next=f.controller.generate("enhance");f.controller.dispose();assert.equal(f.requests[1].signal.aborted,true);f.reply(1);await next;assert.equal(f.edits.length,0);
});
test("mismatched response revision/original is rejected without editing",async()=>{
 const f=fixture();f.type({draft:"original"});const pending=f.controller.generate("enhance");f.reply(0,{draftRev:999});await pending;assert.equal(f.changes.at(-1).error,"stale");assert.equal(f.edits.length,0);f.controller.dispose();
});
test("public whole-span insertion and guarded undo leave attachments untouched",()=>{
 const f=fixture();f.type({draft:"Original",attachmentIds:["keep"]});const ids=f.input.attachmentIds;
 const captured=captureText(f.input,f.actions);const result=applyText(captured,"Enhanced\ntext",()=>f.input,f.actions);
 assert.equal(result.ok,true);assert.equal(f.input.attachmentIds,ids);assert.equal(f.edits.length,1);
 assert.equal(undoText(result.undo,()=>f.input,f.actions).ok,true);assert.equal(f.input.draft,"Original");assert.equal(f.input.attachmentIds,ids);
});
test("same draft with changed revision rejects apply and undo",()=>{
 const f=fixture();f.type({draft:"Original"});const snapshot=captureText(f.input,f.actions);f.type({draftRev:2});
 assert.deepEqual(applyText(snapshot,"New",()=>f.input,f.actions),{ok:false,reason:"stale"});
 const result=applyText(captureText(f.input,f.actions),"New",()=>f.input,f.actions);f.type({draftRev:4});assert.equal(undoText(result.undo,()=>f.input,f.actions).ok,false);
});
test("capture/action revision race and structured documents fail closed",()=>{
 const f=fixture();const actions={...f.actions,captureInsertion:()=>({start:0,end:0,draftRev:999})};assert.equal(captureText(f.input,actions),null);
 f.type({draft:"@file",occurrences:[{label:"file"}]});assert.equal(applyText(captureText(f.input,f.actions),"New",()=>f.input,f.actions).reason,"structured");
 f.type({occurrences:[],claim:{}});assert.equal(applyText(captureText(f.input,f.actions),"New",()=>f.input,f.actions).reason,"structured");
 assert.equal(f.edits.length,0);
});
test("placeholder output never forges a reference or mutates draft",()=>{const f=fixture();assert.equal(applyText(captureText(f.input,f.actions),String.fromCharCode(0xfffc),()=>f.input,f.actions).ok,false);assert.equal(f.edits.length,0);});
test("only explicit native file occurrences parse; names never become paths",()=>{
 assert.deepEqual(selectedFileOf({source:"reference",appearance:"file",label:"a",ref:"@src/a.txt"}),{name:"a",path:"src/a.txt"});
 assert.deepEqual(selectedFileOf({source:"reference",appearance:"file",label:"b",ref:"@\"two words.txt\""}),{name:"b",path:"two words.txt"});
 for(const value of [{source:"other",appearance:"file",label:"a",ref:"@a"},{source:"reference",appearance:"folder",label:"a",ref:"@a/"},{source:"reference",appearance:"file",label:"a",ref:"@a extra"},{name:"@secret",path:"secret"}])assert.equal(selectedFileOf(value),null);
 assert.deepEqual(referenceNames([{label:"x",ref:"hidden"},{ref:"guess"}]),[{name:"x"}]);
});
test("rounds validated without clamping and dictionary keys match",()=>{for(const rounds of [0,21,1.5,NaN])assert.equal(validateSettings({...DEFAULT_SETTINGS,rounds}),"rounds");assert.equal(validateSettings({...DEFAULT_SETTINGS,rounds:20}),null);assert.deepEqual(Object.keys(dictionaries.zh).sort(),Object.keys(dictionaries.en).sort());});
test("same-origin POST uses cookie credentials and only returns scrubbed errors",async()=>{
 let request;const api=createAssistApi(async(url,init)=>{request={url,init};return {ok:true,json:async()=>({ok:true,value:{qaId:null}})};});
 assert.deepEqual(await api("state","session"),{qaId:null});assert.equal(request.init.credentials,"same-origin");assert.equal(request.url,"/local-openai-fast/assist-v2");assert.deepEqual(JSON.parse(request.init.body),{action:"state",sessionId:"session"});
 const failed=createAssistApi(async()=>({ok:false,json:async()=>({ok:false,error:{code:"blocked",message:"secret raw error"}})}));await assert.rejects(failed("state","session"),error=>error.message==="blocked");
});
test("view store does not cross session state implicitly and unsubscribes",()=>{const a=createViewStore(),b=createViewStore();let changes=0;const off=a.subscribe(()=>changes++);a.set({open:true});assert.equal(a.getSnapshot().open,true);assert.equal(b.getSnapshot().open,false);off();a.set({open:false});assert.equal(changes,1);});

test("Host Goal busy cannot be downgraded by a stale idle wire",()=>{
 const host={qaId:"1:2",busy:true,current:{model:"m"}};const wire={qaId:"1:2",busy:false};
 assert.equal(reconcileState(host,wire,{running:false},true).busy,true);
 assert.equal(reconcileState({...host,busy:false},wire,{running:false},true).busy,false);
 assert.equal(reconcileState({...host,busy:false},{...wire,qaId:"3:4"},{running:false},true).busy,true);
 assert.equal(reconcileState(null,wire,{running:false},true).busy,true);
 assert.equal(reconcileState({...host,busy:false},wire,{running:true},true).busy,true);
});
test("custom model catalog receives provider; following remains independent",()=>{assert.deepEqual(catalogInput({followSession:false},"p"),{provider:"p"});assert.deepEqual(catalogInput({followSession:true},"p"),{});});
test("clean saved drafts resync without replacing concurrent unsaved feature edits",()=>{const enhance={model:"new unsaved"};const drafts={suggest:{model:"old saved"},enhance};const cleaned=cleanDraftConfigs(drafts,["enhance"]);assert.deepEqual(Object.keys(cleaned),["enhance"]);assert.equal(cleaned.enhance,enhance);assert.equal(cleanDraftConfigs(cleaned,["enhance"]),cleaned);});
test("older/replayed QA never counts as NEW even beyond the bounded dedup window",()=>{const f=fixture();f.observe();for(let n=2;n<75;n++)f.observe({qaId:String(n*2-1)+":"+String(n*2)});const count=f.requests.length;f.observe({qaId:"3:4"});assert.equal(f.requests.length,count);f.observe({qaId:"not-a-QA"});assert.equal(f.requests.length,count);f.controller.dispose();});
test("Strict effect remount establishes a fresh baseline without historical generation",()=>{const f=fixture();f.observe();f.controller.dispose();f.controller.mount();f.observe({qaId:"3:4"});assert.equal(f.requests.length,0);f.observe({qaId:"5:6"});assert.equal(f.requests.length,1);f.controller.dispose();});
test("adjudicating/submitting and paused input never generate manual requests",async()=>{for(const phase of ["adjudicating","submitting"]){const f=fixture();f.type({draft:"hello",phase});assert.equal(await f.controller.generate("enhance"),false);assert.equal(f.requests.length,0);f.controller.dispose();}});

test("preview and undo owners cannot cross sessions with the same draft/revision",async()=>{const f=fixture();f.type({draft:"same"});const pending=f.controller.generate("enhance");f.reply();await pending;const preview=f.changes.at(-1).preview;assert.equal(ownsResult(preview,"session-a"),true);assert.equal(ownsResult(preview,"other"),false);assert.equal(ownsResult(null,"session-a"),false);f.controller.dispose();});
