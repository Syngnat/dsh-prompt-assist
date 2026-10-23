import {boundedJSON,INSTALL_SPEC,CHECK_TIMEOUT_MS} from './service.js';
export const BUNDLE_NAME='@local/dsh-openai-fast';
export const stableVersion=v=>typeof v==='string'&&v.length<=80&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v);
export const onlineError=code=>Object.assign(new Error(code),{code});
const sha=value=>typeof value==='string'&&/^[a-f0-9]{7,40}$/i.test(value);
const OFFICIAL='syngnat/dsh-prompt-assist';
/** Direct GitHub connections fail often on some networks; each fetch retries before giving up. */
const MAX_FETCH_ATTEMPTS=3,ATTEMPT_TIMEOUT_MS=3500;
/** The bundle manager may record the same official repository in several equivalent spellings. */
function normalizeBase(base){
 return String(base).trim().toLowerCase().replace(/\.git$/,'').replace(/\/+$/,'')
  .replace(/^git\+/,'')
  .replace(/^(?:github:|github\.com\/|https?:\/\/github\.com\/)/,'');
}
export function supportedSource(source,version){
 if(typeof source!=='string'||source.length>200||/[\u0000-\u001f\u007f]/u.test(source))return false;
 const [base,ref,...rest]=source.trim().split('#');
 if(rest.length||normalizeBase(base)!==OFFICIAL)return false;
 if(ref===undefined)return true;
 const clean=ref.trim();
 return clean==='v'+version||sha(clean);
}
/** One bounded, control-character-free copy of an observed source for diagnosis. */
export function observedSource(value){
 return typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u001f\u007f]/u.test(value)?value:null;
}
/** Fixed-origin read-only metadata, not a package installer. Never accepts a caller URL. */
export class ReleasePins {
 constructor({fetch:fetcher=(...args)=>globalThis.fetch(...args),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  if(typeof fetcher!=='function'||typeof wait!=='function')throw new Error('Invalid release-pins dependencies');
  this.fetch=fetcher;this.wait=wait;
 }
 /** Read one already-open response, still bounded and still abortable by the caller. */
 async read(response,signal){
  const guard=AbortSignal.timeout(CHECK_TIMEOUT_MS);
  try{return await boundedJSON(response,signal?AbortSignal.any([signal,guard]):guard);}
  finally{try{await response.body?.cancel();}catch{}}
 }
 /**
  * One metadata document. Each attempt carries its own short deadline, so a
  * cold proxy or a stalled connection is retried instead of failing the whole
  * preparation; classified failures (rate limit, missing document, invalid
  * body) are final, and a caller abort is always rethrown as-is.
  */
 async json(url,signal){
  let last='metadata-unavailable';
  for(let attempt=1;attempt<=MAX_FETCH_ATTEMPTS;attempt++){
   const timeout=AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),combined=signal?AbortSignal.any([signal,timeout]):timeout;
   let response=null;
   try{
    response=await this.fetch(url,{signal:combined,redirect:'error',headers:{Accept:'application/vnd.github+json','User-Agent':'dsh-prompt-assist-online-update'}});
    if(response.ok)return await this.read(response,signal);
    try{await response.body?.cancel();}catch{}
    last='metadata-unavailable';
    if([403,429].includes(response.status))throw onlineError('rate-limited');
    if(response.status===404)throw onlineError('metadata-unavailable');
   }catch(error){
    if(signal?.aborted||error?.code)throw error;
    last=combined.aborted?'timeout':'metadata-unavailable';
   }
   if(attempt<MAX_FETCH_ATTEMPTS)await this.wait(attempt===1?150:400);
  }
  throw onlineError(last);
 }
 async resolve(version,signal,source){
  if(!stableVersion(version))throw onlineError('unsupported-version');
  let commit=source?.split('#')[1];
  if(!sha(commit)){
   let object=(await this.json('https://api.github.com/repos/Syngnat/dsh-prompt-assist/git/ref/tags/v'+version,signal)).object;
   for(let depth=0;object?.type==='tag'&&depth<3;depth++){
    if(!sha(object.sha))throw onlineError('metadata-unavailable');
    object=(await this.json('https://api.github.com/repos/Syngnat/dsh-prompt-assist/git/tags/'+object.sha,signal)).object;
   }
   if(object?.type!=='commit'||!sha(object.sha))throw onlineError('metadata-unavailable');commit=object.sha;
  }
  commit=commit.toLowerCase();
  const manifest=await this.json('https://raw.githubusercontent.com/Syngnat/dsh-prompt-assist/'+commit+'/package.json',signal);
  if(manifest?.name!==BUNDLE_NAME||manifest?.version!==version||!manifest.dsh?.bundle||typeof manifest.dsh.bundle!=='object'||Array.isArray(manifest.dsh.bundle))throw onlineError('package-mismatch');
  if(['preinstall','install','postinstall','prepare'].some(key=>manifest.scripts?.[key]))throw onlineError('script-review-required');
  return INSTALL_SPEC+'#'+commit;
 }
}
