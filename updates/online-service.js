import {randomBytes} from 'node:crypto';
import semver from 'semver';
import {BUNDLE_NAME,ReleasePins,stableVersion,supportedSource,onlineError} from './release-pins.js';
export const UPDATE_JOB_KIND='prompt-assist-update';
const LIVE=new Set(['running','stopping']);
export const OPERATION_FIELDS=['jobId','fromVersion','targetVersion','phase','terminal','installedVersion','error','detailCode','restartRequired','cancelRequested'];
export const ONLINE_PHASES=['queued','checking','removing','installing','activating','verifying','recovering','updated','restart-required','restored','repair-required','failed','cancelled','unknown'];
const TERMINAL=new Set(['updated','restart-required','restored','repair-required','failed','cancelled','unknown']);
const ok=r=>r&&!r.error&&['applied','restart-required'].includes(r.application);
const fingerprint=row=>JSON.stringify([row?.name,row?.version,row?.source,row?.installed,row?.enabled,row?.availability,row?.error?.code]);
const safeCode=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,79}$/.test(v)?v:null;
const diagnostic=r=>safeCode(r?.error?.code)||safeCode(r?.packageResult?.kind)||safeCode(r?.application);
/** Unowned profile jobs are Host-owned and outlive this producer's fiber. No private profile writes. */
export class OnlineUpdateService {
 constructor({manager,jobs,currentVersion,updates,hasHmr=true,pins=new ReleasePins(),clock=Date.now,token=()=>randomBytes(32).toString('hex'),schedule=fn=>setImmediate(fn),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),activationAttempts=40,readLoadedVersion}){
  Object.assign(this,{manager,jobs,currentVersion,updates,hasHmr,pins,clock,token,schedule,wait,activationAttempts,readLoadedVersion});this.plans=new Map();this.disposed=false;this.abort=new AbortController();
 }
 async bundle(){return (await this.manager.listBundles()).find(row=>row.name===BUNDLE_NAME);}
 records(){return this.jobs?.list().filter(job=>job.kind===UPDATE_JOB_KIND&&!job.owner)??[];}
 active(){return this.records().find(job=>LIVE.has(job.status));}
 snapshot(job){
  if(!job)return null;
  const chunks=this.jobs.readAt(job.id,0).chunks;
  for(let i=chunks.length-1;i>=0;i--){
   try{
    const value=JSON.parse(chunks[i].text);
    if(value?.jobId!==job.id||value.protocol!==1)continue;
    const valid=stableVersion(value.fromVersion)&&stableVersion(value.targetVersion)&&ONLINE_PHASES.includes(value.phase)
     &&['terminal','restartRequired','cancelRequested'].every(key=>typeof value[key]==='boolean')
     &&(value.installedVersion===null||stableVersion(value.installedVersion))
     &&['error','detailCode'].every(key=>value[key]===null||safeCode(value[key])!==null)
     &&(value.phase==='unknown'||value.terminal===TERMINAL.has(value.phase))
     &&(value.phase!=='updated'||value.installedVersion===value.targetVersion&&!value.restartRequired&&value.error===null)
     &&(value.phase!=='restart-required'||value.restartRequired)
     &&(value.phase!=='restored'||value.installedVersion===value.fromVersion);
    if(!valid)break;
    const snapshot=Object.fromEntries(OPERATION_FIELDS.map(key=>[key,value[key]]));
    return {...snapshot,terminal:!LIVE.has(job.status)||snapshot.terminal,phase:!LIVE.has(job.status)&&!snapshot.terminal?'unknown':snapshot.phase};
   }catch{}
  }
  return {jobId:job.id,fromVersion:this.currentVersion,targetVersion:this.currentVersion,phase:'unknown',terminal:!LIVE.has(job.status),installedVersion:null,error:'state-unavailable',detailCode:null,restartRequired:false,cancelRequested:false};
 }
 async eligibility(){
  if(!this.manager)return {reason:'manager-unavailable'};
  if(!this.jobs)return {reason:'jobs-unavailable'};
  if(typeof this.readLoadedVersion!=='function')return {reason:'readiness-unavailable'};
  const row=await this.bundle();
  if(!row?.installed||row.availability!=='profile'||row.readOnlyReason||row.error)return {reason:'unsupported-installation'};
  if(!stableVersion(row.version)||!stableVersion(this.currentVersion))return {reason:'unsupported-version'};
  if(row.version!==this.currentVersion)return {reason:'restart-required'};
  if(!supportedSource(row.source,row.version))return {reason:'unsupported-source'};
  if(!row.enabled)return {reason:'disabled'};
  if(this.hasHmr&&!row.removable)return {reason:'not-removable'};
  return {reason:null,row};
 }
 async status(){
  const {reason}=await this.eligibility();const records=this.records();const record=records.find(job=>LIVE.has(job.status))??records.at(-1);
  return {currentVersion:this.currentVersion,available:!reason&&!records.some(job=>LIVE.has(job.status)),reason:records.some(job=>LIVE.has(job.status))?'busy':reason,operation:this.snapshot(record)};
 }
 async prepare(signal){
  if(this.disposed)throw onlineError('unavailable');
  signal=signal?AbortSignal.any([signal,this.abort.signal]):this.abort.signal;
  if(this.active())throw onlineError('busy');const {reason,row}=await this.eligibility();if(reason)throw onlineError(reason);
  const checked=this.updates.status();if(checked.status!=='update-available'||!stableVersion(checked.latestVersion)||!semver.gt(checked.latestVersion,row.version))throw onlineError('check-required');
  const targetVersion=checked.latestVersion;
  const targetSpec=await this.pins.resolve(targetVersion,signal),restoreSpec=await this.pins.resolve(row.version,signal,row.source);
  signal?.throwIfAborted();if(this.disposed)throw onlineError('unavailable');
  if(this.active()||fingerprint(await this.bundle())!==fingerprint(row))throw onlineError('inventory-changed');
  for(const [key,p]of this.plans)if(p.expiresAt<=this.clock())this.plans.delete(key);
  if(this.plans.size>=8)this.plans.delete(this.plans.keys().next().value);
  const token=this.token(),plan={token,fromVersion:row.version,targetVersion,targetSpec,restoreSpec,expiresAt:this.clock()+180000,row:{...row}};
  this.plans.set(token,plan);const {row:ignored,...publicPlan}=plan;return publicPlan;
 }
 async confirm({token,targetVersion,consent}){
  if(this.disposed||consent!==true)throw onlineError('confirmation-required');
  const plan=this.plans.get(token);if(!plan||plan.expiresAt<=this.clock()||targetVersion!==plan.targetVersion)throw onlineError('confirmation-expired');
  this.plans.delete(token);if(this.active())throw onlineError('busy');
  if(fingerprint(await this.bundle())!==fingerprint(plan.row))throw onlineError('inventory-changed');
  if(this.disposed)throw onlineError('unavailable');if(this.active())throw onlineError('busy');
  let initial;
  // Synchronous admission lease; never hold a global controller across an await.
  const detach=this.jobs.attachController('prompt-assist-online-update');
  try{this.jobs.start({kind:UPDATE_JOB_KIND,label:'Update '+BUNDLE_NAME+' '+plan.fromVersion+' → '+plan.targetVersion,outputLimitBytes:16384,
   run:handle=>{
    let cancelled=false;const control={requestId:null,recovery:false};
    const state={jobId:handle.id,fromVersion:plan.fromVersion,targetVersion:plan.targetVersion,phase:'queued',terminal:false,installedVersion:null,error:null,detailCode:null,restartRequired:false,cancelRequested:false};
    const publish=(phase,patch={})=>{Object.assign(state,patch,{phase,terminal:TERMINAL.has(phase),cancelRequested:cancelled});handle.updateProgress(phase);handle.append(JSON.stringify({protocol:1,...state})+'\n',{channel:'log'});};
    publish('queued');initial={...state};
    const done=new Promise(resolve=>this.schedule(()=>{void this.run(plan,control,publish,()=>cancelled).catch(()=>publish('repair-required',{error:'host-error'})).then(()=>resolve({status:state.phase==='cancelled'||state.phase==='restored'&&state.error==='cancelled'?'killed':['failed','repair-required','unknown','restored'].includes(state.phase)?'failed':'completed',detail:state.phase,result:JSON.stringify(state)}));}));
    return {done,cancel:()=>{cancelled=true;if(control.requestId&&!control.recovery)void this.manager.cancelInstall(control.requestId).catch(()=>{});}};
   }});}finally{detach();}
  return initial;
 }
 async activeHost(version){
  let loaded=null;
  for(let attempt=0;attempt<this.activationAttempts;attempt++){
   const rows=(await this.manager.listPlugins()).filter(row=>row.moduleName===BUNDLE_NAME);
   if(rows.length===1&&rows[0].enabled&&rows[0].fiberPhase==='active'){loaded=await this.readLoadedVersion();if(loaded===version)return true;}
   if(rows.some(row=>!row.enabled||row.fiberPhase==='failed'))throw onlineError('enable-failed');
   await this.wait(250);
  }
  if(stableVersion(loaded)&&loaded!==version)return false;
  throw onlineError('activation-timeout');
 }
 async run(plan,control,publish,cancelled){
  let mutated=false,primaryError=null;
  const fail=(code,result)=>{const error=onlineError(code);error.result=result;throw error;};
  const inspect=async(version,spec)=>{const row=await this.bundle();if(!row?.installed||row.availability!=='profile'||row.error||row.version!==version||row.source!==spec)fail('version-mismatch');return row;};
  const install=async(spec,version,recovery=false)=>{
   control.recovery=recovery;control.requestId=this.token();
   let result;try{result=await this.manager.installBundle(spec,{enabled:false,requestId:control.requestId});}finally{control.requestId=null;}
   if(!ok(result)||result.bundle!==BUNDLE_NAME||result.version!==version)fail('install-failed',result);
   let restart=result.application==='restart-required';await inspect(version,spec);
   if(!recovery&&cancelled())fail('cancelled');
   if(!recovery)publish('activating');
   const enabled=await this.manager.setBundleEnabled(BUNDLE_NAME,plan.row.enabled);
   if(!ok(enabled))fail('enable-failed',enabled);restart ||= enabled.application==='restart-required';
   const row=await inspect(version,spec);if(row.enabled!==plan.row.enabled)fail('enable-failed',enabled);
   return restart;
  };
  try{
   publish('checking');if(cancelled()){publish('cancelled');return;}
   if(fingerprint(await this.bundle())!==fingerprint(plan.row))fail('inventory-changed');
   if(cancelled()){publish('cancelled');return;}
   // A startup-only profile cannot remove a running package. Its documented replacement path waits for restart.
   mutated=true;
   if(this.hasHmr){publish('removing');const removed=await this.manager.removeBundle(BUNDLE_NAME);if(!ok(removed))fail('remove-failed',removed);const remaining=await this.bundle();if(remaining?.installed)fail('remove-failed',removed);}
   if(cancelled())fail('cancelled');
   publish('installing');let restart=await install(plan.targetSpec,plan.targetVersion);
   publish('verifying');await inspect(plan.targetVersion,plan.targetSpec);if(!restart)restart=!(await this.activeHost(plan.targetVersion));
   publish(restart?'restart-required':'updated',{installedVersion:plan.targetVersion,restartRequired:restart});
  }catch(error){
   primaryError=safeCode(error?.code)||'host-error';const detailCode=diagnostic(error?.result);
   if(!mutated){publish(primaryError==='cancelled'?'cancelled':'failed',{error:primaryError,detailCode});return;}
   publish('recovering',{error:primaryError,detailCode});control.recovery=true;
   try{
    let row=await this.bundle();
    // Never overwrite a different installation made by another manager caller between our steps.
    if(row?.installed&&!([plan.fromVersion,plan.targetVersion].includes(row.version)&&[plan.row.source,plan.targetSpec,plan.restoreSpec].includes(row.source)))fail('inventory-changed');
    let restart=false;
    if(row?.installed&&row.version===plan.fromVersion&&!row.error&&row.availability==='profile'&&row.source===plan.row.source){
     const enabled=await this.manager.setBundleEnabled(BUNDLE_NAME,plan.row.enabled);if(!ok(enabled))fail('recovery-failed',enabled);restart=enabled.application==='restart-required';
    }else{
     if(row?.installed&&this.hasHmr){const removed=await this.manager.removeBundle(BUNDLE_NAME);if(!ok(removed))fail('recovery-failed',removed);}
     restart=await install(plan.restoreSpec,plan.fromVersion,true);
    }
    row=await this.bundle();if(!row?.installed||row.version!==plan.fromVersion||row.enabled!==plan.row.enabled||row.error||row.availability!=='profile')fail('recovery-failed');
    if(!restart)restart=!(await this.activeHost(plan.fromVersion));
    publish('restored',{installedVersion:plan.fromVersion,restartRequired:restart});
   }catch(recovery){publish('repair-required',{error:primaryError,detailCode:diagnostic(recovery?.result)||safeCode(recovery?.code)||'recovery-failed'});}
  }
 }
 dispose(){this.disposed=true;this.abort.abort();this.plans.clear();/* Host jobs, not this plugin, own work already accepted. */}
}
