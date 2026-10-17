export const FILE_BYTES = 65536;
export const TOTAL_BYTES = 131072;
export const FILE_LIMITS = Object.freeze({ fileBytes: FILE_BYTES, totalBytes: TOTAL_BYTES });

function failure(code) { return Object.assign(new Error(code), { code }); }
function checkAbort(signal) { if (signal?.aborted) throw failure("aborted"); }

function sensitiveName(name) {
  const parts = name.replaceAll("\\", "/").toLowerCase().split("/").map(part => part.replace(/[ .]+$/u, ""));
  return parts.some(part => /^(?:\.env(?:[._-].*)?|\.ssh|\.aws|\.azure|\.kube|\.gnupg|\.git|\.npmrc|\.pypirc|\.netrc)$/u.test(part)
    || /^(?:id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials?|secrets?|passwords?)(?:[._-].*)?$/u.test(part)
    || /^(?:auth|service[-_]?account)\.json$/u.test(part)
    || /\.(?:pem|key|p12|pfx|jks|keystore|kdbx)$/u.test(part));
}

function unsupportedName(name) {
  return /\.(?:png|jpe?g|gif|webp|ico|bmp|tiff?|pdf|zip|gz|bz2|xz|7z|rar|tar|woff2?|ttf|otf|eot|mp[34]|wav|avi|mov|mkv|exe|dll|so|dylib|class|jar|wasm|db|sqlite3?|docx?|xlsx?|pptx?|bin)$/iu.test(name);
}

function validatePath(path) {
  if (typeof path !== "string" || !path || path !== path.trim() || path.length > 32768
    || /[\u0000-\u001f\u007f*?]/u.test(path) || /[\\/]$/u.test(path)
    || path.startsWith("\\\\") || path.startsWith("//")) throw failure("invalid-file-path");
  const drive = /^[a-z]:[\\/]/iu.test(path);
  if (/^[a-z][a-z\d+.-]*:/iu.test(path) && !drive) throw failure("invalid-file-path");
  if ((drive ? path.slice(2) : path).includes(":")) throw failure("invalid-file-path");
  if ([".", ".."].includes(path.split(/[\\/]/u).at(-1))) throw failure("invalid-file-path");
}

export function validateFileEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw failure("invalid-file-entry");
  if (Object.keys(entry).some(key => !["path", "receiptId", "name"].includes(key))) throw failure("invalid-file-entry");
  if (typeof entry.name !== "string" || !entry.name || entry.name !== entry.name.trim()
    || entry.name.length > 1024 || /[\u0000-\u001f\u007f]/u.test(entry.name)) throw failure("invalid-file-entry");
  const hasPath = Object.hasOwn(entry, "path");
  const hasReceipt = Object.hasOwn(entry, "receiptId");
  if (hasPath === hasReceipt) throw failure("invalid-file-entry");
  if (hasPath) validatePath(entry.path);
  if (hasReceipt && (typeof entry.receiptId !== "string" || !entry.receiptId
    || entry.receiptId.length > 1024 || entry.receiptId !== entry.receiptId.trim()
    || /[\u0000-\u001f\u007f]/u.test(entry.receiptId))) throw failure("invalid-file-entry");
  if (sensitiveName(entry.name) || (hasPath && sensitiveName(entry.path))) throw failure("sensitive-file");
  if (unsupportedName(entry.name) || (hasPath && unsupportedName(entry.path))) throw failure("unsupported-file");
}

function decodeText(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw failure("unsupported-file"); }
  if (/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/u.test(text)
    || /^(?:%PDF-|GIF8[79]a)/u.test(text)) throw failure("unsupported-file");
  if (/-----BEGIN (?:[A-Z\d]+ )*PRIVATE KEY-----/u.test(text)
    || /\b(?:AKIA|ASIA)[A-Z\d]{16}\b/u.test(text)
    || /\b(?:sk-[A-Za-z\d_-]{20,}|gh[pousr]_[A-Za-z\d]{30,}|github_pat_[A-Za-z\d_]{30,}|xox[baprs]-[A-Za-z\d-]{20,})\b/u.test(text)
    || /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)["\x27]?\s*[:=]\s*["\x27][A-Za-z\d+/_=-]{16,}["\x27]/iu.test(text)) throw failure("sensitive-file");
  return text;
}

async function readEntry(entry, options, maxBytes) {
  const reader = Object.hasOwn(entry, "path") ? options.readBytes : options.readReceipt;
  if (typeof reader !== "function") throw failure("file-reader-unavailable");
  try {
    return await reader(entry.path ?? entry.receiptId, options.signal, maxBytes);
  } catch (error) {
    if (options.signal?.aborted || error?.name === "AbortError" || error?.code === "aborted") throw failure("aborted");
    if (["sensitive-file", "not-a-file", "invalid-receipt", "unsupported-file", "invalid-file-path", "files-too-large"].includes(error?.code)) throw failure(error.code);
    if (error?.code === "file-too-large" || error?.code === "FS_TOO_LARGE") throw failure(maxBytes <= FILE_BYTES ? "files-too-large" : "file-too-large");
    throw failure("file-read-failed");
  }
}

/** Only caller-selected entries; adapters enforce access policy and must never silently truncate. */
export async function readSelectedFiles(entries = [], options = {}) {
  if (!Array.isArray(entries) || !options || typeof options !== "object") throw failure("invalid-file-entry");
  checkAbort(options.signal);
  options = { readBytes: options.readBytes, readReceipt: options.readReceipt, signal: options.signal };
  const selected = entries.map(entry => { const value = entry && { ...entry }; validateFileEntry(value); return value; });
  const files = [];
  let total = 0;
  for (const entry of selected) {
    checkAbort(options.signal);
    // One sentinel byte distinguishes oversize from an exactly-at-limit file.
    const maxBytes = Math.min(FILE_BYTES, TOTAL_BYTES - total) + 1;
    const bytes = await readEntry(entry, options, maxBytes);
    checkAbort(options.signal);
    if (!(bytes instanceof Uint8Array)) throw failure("invalid-file-bytes");
    if (bytes.byteLength > FILE_BYTES) throw failure("file-too-large");
    if (total + bytes.byteLength > TOTAL_BYTES) throw failure("files-too-large");
    const text = decodeText(bytes);
    total += bytes.byteLength;
    files.push({ name: entry.name, text, bytes: bytes.byteLength });
  }
  return { files, warnings: [] };
}
