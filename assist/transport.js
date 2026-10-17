import { ASSIST_PATH } from './identity.js';
import { failure } from './model-call.js';
const MAX_BODY = 393216;
const local = address => /^(?:::1|127\.\d+\.\d+\.\d+|::ffff:127\.\d+\.\d+\.\d+)$/.test(address ?? '');

export function trustedRequest(ctx, req) {
  if (!local(req.socket?.remoteAddress)) return false;
  if (ctx.connection.requestRejection({ headers: req.headers }) !== undefined) return false;
  const host = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
  if (!host) return false;
  const origin = req.headers.origin;
  if (typeof origin !== 'string') return false;
  try { return new URL(origin).host === host && ['http:', 'https:'].includes(new URL(origin).protocol); }
  catch { return false; }
}

async function readBody(req) {
  let size = 0;
  const parts = [];
  for await (const part of req) {
    const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += bytes.length;
    if (size > MAX_BODY) throw failure('request-too-large');
    parts.push(bytes);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw failure('invalid-request'); }
}

function respond(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

export function installAssistRoute(ctx, service) {
  return ctx.effect(() => ctx.webServer.register({
    kind: 'exact', path: ASSIST_PATH,
    async handler(req, res) {
      if (req.method !== 'POST' || !trustedRequest(ctx, req)) return respond(res, 403, { ok: false, error: { code: 'forbidden' } });
      if (String(req.headers['content-type']).split(';')[0].trim().toLowerCase() !== 'application/json') return respond(res, 415, { ok: false, error: { code: 'invalid-request' } });
      const controller = new AbortController();
      const closed = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close', closed);
      try {
        const input = await readBody(req);
        const value = await service.dispatch(input, { signal: controller.signal, fromUI: true });
        respond(res, 200, { ok: true, value });
      } catch (error) {
        const code = controller.signal.aborted ? 'cancelled' : service.errorCode(error);
        respond(res, code === 'forbidden' ? 403 : 400, { ok: false, error: { code } });
      } finally { res.off('close', closed); }
    },
  }));
}
