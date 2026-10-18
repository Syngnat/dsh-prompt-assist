import { streamAssist } from './stream-transport.js';
import { ASSIST_CHANNEL, ASSIST_ENDPOINT } from './identity.js';

/** Connection owns browser authentication and the Desktop carrier, not this plugin. */
export function installAssistRpc(ctx, service) {
  const handle = async (endpoint, input, signal) => {
    const fail = code => ({ ok: false, error: { code, message: code, details: {} } });
    if (endpoint !== ASSIST_ENDPOINT) return fail('unknown-action');
    try {
      signal.throwIfAborted();
      const value = await service.dispatch(input, { signal, fromUI: true });
      // Content-free receipt for diagnosing the real UI path, never a chat event.
      if (input.action === 'state') service.noteTransportRead?.(input.sessionId);
      return { ok: true, value };
    } catch (error) {
      return fail(signal.aborted ? 'cancelled' : service.errorCode(error));
    }
  };
  // The shared Fetch registry authenticates and requires owner before invoking us.
  return ctx.connection.fetch.register({
    path: ASSIST_CHANNEL + '/' + ASSIST_ENDPOINT, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
      const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
      if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply({error:'invalid-request'},415);
      let envelope;
      try { const text=await request.text(); envelope=JSON.parse(text); }
      catch { return reply({error:'invalid-request'},400); }
      if(envelope?.type!=='client-request'||typeof envelope.rpcId!=='string'||envelope.rpcId.length>200||envelope.method!==ASSIST_ENDPOINT)return reply({error:'invalid-request'},400);
      const result=await handle(envelope.method,envelope.payload,request.signal);
      return reply({type:'server-response',rpcId:envelope.rpcId,result});
    },
  });
}

export function createAssistRpcApi(connection, fetcher = (...args) => globalThis.fetch(...args)) {
  return async (action, sessionId, input = {}, signal, onText) => {
    if(action==='generate'&&typeof onText==='function')return streamAssist(fetcher,sessionId,input,signal,onText);
    let result;
    try {
      result = await connection.rpc.call(ASSIST_CHANNEL, ASSIST_ENDPOINT,
        { ...input, action, sessionId }, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      throw Object.assign(new Error('transport-unavailable'), { code: 'transport-unavailable' });
    }
    if (result?.ok !== true) {
      const code = result?.error?.code ?? 'transport-invalid-response';
      throw Object.assign(new Error(code), { code });
    }
    return result.value;
  };
}
