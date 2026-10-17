import { validateFileEntry } from './files.js';
import { failure } from './model-call.js';

export function sensitivePath(value) {
  return /(?:^|[\\/])(?:\.env(?:\..*)?|\.ssh|\.aws|\.dsh|credentials?(?:\..*)?|secrets?(?:\..*)?|id_rsa|id_ed25519)(?:[\\/]|$)|\.(?:pem|key|p12|pfx)$/i.test(value);
}

export function fileReaders(ctx, agent) {
  const fs = ctx.get('agentPresets')?.serviceFor(agent, 'fs') ?? ctx.fs;
  const cwd = ctx.workingDirectory.get(agent.session);
  return {
    async readBytes(path, signal, maxBytes) {
      if (sensitivePath(path)) throw failure('sensitive-file');
      const target = await fs.resolve(path, { cwd, signal });
      const canonical = fs.processPath(target);
      validateFileEntry({ path: canonical, name: canonical.replaceAll('\\', '/').split('/').at(-1) });
      if (sensitivePath(canonical)) throw failure('sensitive-file');
      const info = await fs.stat(target, signal);
      if (info?.type !== 'file') throw failure('not-a-file');
      if (info.size > maxBytes) throw failure('file-too-large');
      return fs.readBytes(target, signal, maxBytes);
    },
    async readReceipt(id, signal, maxBytes) {
      const ref = ctx.fileUploads.resolve(agent, id);
      if (!ref) throw failure('invalid-receipt');
      validateFileEntry({ receiptId: id, name: ref.name });
      if (sensitivePath(ref.name)) throw failure('sensitive-file');
      if (ref.bytes > maxBytes) throw failure('file-too-large');
      const chunks = [];
      let size = 0;
      for await (const chunk of ctx.attachments.readFileStream(ref, signal)) {
        size += chunk.byteLength;
        if (size > maxBytes) throw failure('file-too-large');
        chunks.push(chunk);
      }
      return Buffer.concat(chunks, size);
    },
  };
}
