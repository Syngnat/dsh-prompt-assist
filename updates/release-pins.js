import {boundedJSON,INSTALL_SPEC,CHECK_TIMEOUT_MS} from './service.js';
export const BUNDLE_NAME='@local/dsh-openai-fast';
export const stableVersion=v=>typeof v==='string'&&v.length<=80&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v);
export const onlineError=code=>Object.assign(new Error(code),{code});
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/i.test(value);
export function supportedSource(source,version){
 if(typeof source!=='string')return false;
 const [base,ref,...rest]=source.split('#');
 return base.toLowerCase()===INSTALL_SPEC.toLowerCase()&&!rest.length&&(ref===undefined||ref==='v'+version||sha(ref));
}
/** Fixed-origin read-only metadata, not a package installer. Never accepts a caller URL. */
export class ReleasePins {
 constructor({fetch:fetcher=(...args)=>globalThis.fetch(...args)}={}){this.fetch=fetcher;}
 async json(url,signal){
  const timeout=AbortSignal.timeout(CHECK_TIMEOUT_MS),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  try{
   const response=await this.fetch(url,{signal:combined,redirect:'error',headers:{Accept:'application/vnd.github+json','User-Agent':'dsh-prompt-assist-online-update'}});
   if(!response.ok){try{await response.body?.cancel();}catch{}throw onlineError([403,429].includes(response.status)?'rate-limited':'metadata-unavailable');}
   return await boundedJSON(response,combined);
  }catch(error){if(['rate-limited','metadata-unavailable'].includes(error?.code))throw error;throw onlineError(combined.aborted?'timeout':'metadata-unavailable');}
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
