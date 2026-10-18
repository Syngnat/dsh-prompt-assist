import {ENABLEMENT_PATH} from './identity.js';

/** Pure-read profile snapshots; the native Connection registry owns authentication. */
export function installEnablementWatch(ctx, store) {
  return ctx.effect(() => {
    const active = new Set();
    const unregister = ctx.connection.fetch.register({
      path: ENABLEMENT_PATH, methods: ['GET'], requestBody: 'buffered',
      async fetch(request) {
        const encoder = new TextEncoder();
        let unsubscribe, stream, latest, ended = false;
        const stop = (close = true) => {
          if (ended) return;
          ended = true; unsubscribe?.(); active.delete(stop);
          request.signal.removeEventListener('abort', abort);
          if (close) stream?.close();
        };
        const abort = () => stop();
        const flush = () => {
          if (!ended && latest && stream.desiredSize > 0) {
            const value = latest; latest = undefined;
            stream.enqueue(encoder.encode(JSON.stringify(value)+'\n'));
          }
        };
        const body = new ReadableStream({
          start(controller) {
            stream = controller; active.add(stop);
            if (request.signal.aborted) { stop(); return; }
            request.signal.addEventListener('abort',abort,{once:true});
            unsubscribe = store.subscribe(value => { latest = value; flush(); });
            latest = store.getSnapshot(); flush();
          },
          pull() { flush(); },
          cancel() { stop(false); },
        });
        return new Response(body,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
      },
    });
    return async () => { for (const stop of [...active]) stop(); await unregister(); };
  });
}
