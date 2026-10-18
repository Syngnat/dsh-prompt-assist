import {OnlineUpdateService,OPERATION_FIELDS,ONLINE_PHASES} from './online-service.js';
import {ReleasePins,onlineError} from './release-pins.js';
const nullable=type=>({oneOf:[{type},{type:'null'}]});
export const operationSchema={type:'object',properties:{jobId:{type:'string'},fromVersion:{type:'string'},targetVersion:{type:'string'},phase:{type:'string',enum:ONLINE_PHASES},terminal:{type:'boolean'},installedVersion:nullable('string'),error:nullable('string'),detailCode:nullable('string'),restartRequired:{type:'boolean'},cancelRequested:{type:'boolean'}},required:OPERATION_FIELDS,additionalProperties:false};
export const ONLINE_PATH='/api/local-openai-fast.online-update';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
export async function readOnlineBody(request){
 // Connection already authenticates the owner and enforces Host/Origin trust. Its carrier may normalize URLs or omit browser-generated headers.
 const site=request.headers.get('sec-fetch-site');if(site&&!['same-origin','none'].includes(site))throw onlineError('owner-confirmation-required');
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))throw onlineError('invalid-request');
 const reader=request.body?.getReader();if(!reader)throw onlineError('invalid-request');let size=0,parts=[];
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096)throw onlineError('invalid-request');parts.push(value);}}
 finally{try{await reader.cancel();}catch{}reader.releaseLock();}
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}catch{throw onlineError('invalid-request');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw onlineError('invalid-request');
 if(value.action==='prepare'&&Object.keys(value).length===1)return value;
 if(value.action==='confirm'&&Object.keys(value).length===4&&typeof value.token==='string'&&/^[a-f0-9]{64}$/.test(value.token)&&typeof value.targetVersion==='string'&&value.consent===true)return value;
 throw onlineError('invalid-request');
}
/** Native shared-fetch registration is owner-authenticated. Confirmation has no model-callable tool. */
export function installOnlineUpdateHost(ctx,{updates,currentVersion,manager=ctx.get?.('pluginManager'),jobs=ctx.get?.('jobs'),hasHmr=Boolean(ctx.get?.('hmr')),pins=new ReleasePins(),...options}){
 if(!['listBundles','listPlugins','installBundle','removeBundle','setBundleEnabled','cancelInstall'].every(key=>typeof manager?.[key]==='function'))manager=undefined;
 if(!['list','start','readAt','attachController'].every(key=>typeof jobs?.[key]==='function'))jobs=undefined;
 const connection=ctx.connection;
 const probe=typeof connection.createSharedFetchHandler==='function'&&connection.browserPeer?async()=>{
  const response=await connection.createSharedFetchHandler('/api').fetch(new Request('http://connection.invalid/api/local-openai-fast.updates'),connection.browserPeer);
  if(!response.ok)return null;try{return (await response.json()).currentVersion??null;}catch{return null;}
 }:undefined;
 const service=new OnlineUpdateService({updates,currentVersion,manager,jobs,hasHmr,pins,readLoadedVersion:probe,...options});
 ctx.effect(()=>{
  const unregister=ctx.connection.fetch.register({path:ONLINE_PATH,methods:['GET','POST'],requestBody:'buffered',async fetch(request){
   try{
    request.signal.throwIfAborted();
    if(request.method==='GET')return json(await service.status());
    if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'GET, POST'}});
    const value=await readOnlineBody(request);
    if(value.action==='prepare')return json(await service.prepare(request.signal));
    return json(await service.confirm(value));
   }catch(error){return json({error:typeof error?.code==='string'&&/^[a-z][a-z0-9-]{0,79}$/.test(error.code)?error.code:'host-error'},409);}
  }});
  return async()=>{service.dispose();await unregister();};
 });
 return service;
}
