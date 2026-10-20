export const STREAM_PATH='/api/local-openai-fast.stream';

/** Shared Connection authenticates and enforces owner before this handler runs. */
export function installAssistStream(ctx, service) {
 return ctx.connection.fetch.register({path:STREAM_PATH,methods:['POST'],requestBody:'buffered',async fetch(request){
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return new Response(null,{status:415});
  let input;
  try{const text=await request.text();input=JSON.parse(text);}catch{return new Response(null,{status:400});}
  if(input?.action!=='generate')return new Response(null,{status:400});
  const stop=new AbortController();const signal=AbortSignal.any([request.signal,stop.signal]);
  const encoder=new TextEncoder();let ended=false,latest='',sent='',last=0;
  // Advance the watermark before writing: a pull scheduled by this enqueue must
  // never observe the previous watermark and resend the same slice.
  const flush=()=>{const delta=latest.slice(sent.length);sent=latest;last=performance.now();return delta;};
  const body=new ReadableStream({
   start(stream){
    const emit=value=>{if(!ended&&!signal.aborted)stream.enqueue(encoder.encode(JSON.stringify(value)+'\n'));};
    const onText=text=>{latest=text;if(stream.desiredSize>0&&(performance.now()-last>=Math.min(250,40+text.length/4096)||!sent))emit({type:'delta',text:flush()});};
    void service.dispatch(input,{signal,fromUI:true,onText}).then(value=>{
      // A tail delta still owed to the reader must precede the result frame.
      if(!ended&&!signal.aborted&&latest!==sent)emit({type:'delta',text:flush()});
      emit({type:'result',value});
    }).catch(error=>emit({type:'error',code:service.errorCode(error)})).finally(()=>{if(!ended){ended=true;stream.close();}});
   },
   pull(stream){if(!ended&&!signal.aborted&&latest!==sent)stream.enqueue(encoder.encode(JSON.stringify({type:'delta',text:flush()})+'\n'));},
   cancel(){ended=true;stop.abort();},
  });
  return new Response(body,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
 }});
}

export async function streamAssist(fetcher, sessionId, input, signal, onText) {
 const response=await fetcher(STREAM_PATH.slice(1),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,sessionId,action:'generate'}),signal});
 if(!response.ok||!response.body)throw Object.assign(new Error('transport-unavailable'),{code:'transport-unavailable'});
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',text='',result,complete=false;
 const accept=line=>{if(!line)return;const frame=JSON.parse(line);signal?.throwIfAborted();
  if(frame.type==='delta'&&typeof frame.text==='string'){text+=frame.text;onText(text);}
   else if(frame.type==='text'&&typeof frame.text==='string'){text=frame.text;onText(text);} // Legacy cumulative frames remain readable.
  else if(frame.type==='result'){result=frame.value;complete=true;}
  else if(frame.type==='error')throw Object.assign(new Error(frame.code),{code:frame.code});
 };
 try{
  for(;;){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let index;while((index=buffer.indexOf('\n'))>=0){accept(buffer.slice(0,index));buffer=buffer.slice(index+1);}}
  buffer+=decoder.decode();if(buffer)accept(buffer);
  if(!complete)throw Object.assign(new Error('incomplete-stream'),{code:'transport-incomplete'});
  return result;
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
