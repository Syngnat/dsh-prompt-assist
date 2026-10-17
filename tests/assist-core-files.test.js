import test from "node:test";
import assert from "node:assert/strict";
import { readSelectedFiles, FILE_BYTES, TOTAL_BYTES, FILE_LIMITS } from "../assist/files.js";

const encode = text => new TextEncoder().encode(text);
const entry = (path = "src/module.js", name = "module.js") => ({ path, name });

test("empty explicit selection does no I/O", async () => {
  let reads = 0;
  const value = await readSelectedFiles([], { readBytes: () => { reads++; } });
  assert.deepEqual(value, { files: [], warnings: [] }); assert.equal(reads, 0);
  assert.deepEqual(FILE_LIMITS, { fileBytes: 65536, totalBytes: 131072 });
});

test("read only explicit paths and receipts with exact name, signal, sentinel limit", async () => {
  const controller = new AbortController();
  const calls = [];
  const selected = Object.freeze([Object.freeze(entry("C:\\project\\file.txt", "Display.txt")), Object.freeze({ receiptId: "r1", name: "receipt.md" })]);
  const value = await readSelectedFiles(selected, { signal: controller.signal,
    readBytes: async (...args) => { calls.push(["path", ...args]); return encode("你好"); },
    readReceipt: async (...args) => { calls.push(["receipt", ...args]); return encode("receipt text"); },
  });
  assert.deepEqual(calls, [["path", "C:\\project\\file.txt", controller.signal, FILE_BYTES + 1],
    ["receipt", "r1", controller.signal, FILE_BYTES + 1]]);
  assert.deepEqual(value, { files: [{ name: "Display.txt", text: "你好", bytes: 6 },
    { name: "receipt.md", text: "receipt text", bytes: 12 }], warnings: [] });
});

test("64KiB exact UTF-8 file is complete and never truncated", async () => {
  const text = "中".repeat(21845) + "a";
  const bytes = encode(text); assert.equal(bytes.byteLength, FILE_BYTES);
  const value = await readSelectedFiles([entry()], { readBytes: async () => bytes });
  assert.equal(value.files[0].text, text); assert.equal(value.files[0].bytes, FILE_BYTES);
  await assert.rejects(readSelectedFiles([entry()], { readBytes: async () => new Uint8Array(FILE_BYTES + 1).fill(120) }), { code: "file-too-large" });
});

test("128KiB total cap is strict across paths and receipts with remaining-byte sentinel", async () => {
  const selected = [entry("a.txt", "a.txt"), { receiptId: "b", name: "b.txt" }];
  const options = { readBytes: async () => new Uint8Array(FILE_BYTES).fill(97), readReceipt: async () => new Uint8Array(FILE_BYTES).fill(98) };
  const value = await readSelectedFiles(selected, options);
  assert.equal(value.files.reduce((sum, file) => sum + file.bytes, 0), TOTAL_BYTES);
  const calls = [];
  await assert.rejects(readSelectedFiles([...selected, entry("c.txt", "c.txt")], { ...options,
    readBytes: async (path, signal, maxBytes) => { calls.push(maxBytes); return encode(path === "c.txt" ? "x" : "a".repeat(FILE_BYTES)); },
  }), { code: "files-too-large" });
  assert.deepEqual(calls, [FILE_BYTES + 1, 1]);
});

test("validate entire selection before reading; secret aliases cannot bypass path/name checks", async () => {
  let reads = 0;
  const options = { readBytes: async () => { reads++; return encode("safe"); }, readReceipt: async () => { reads++; return encode("safe"); } };
  for (const target of [entry(".env", "safe.txt"), entry("safe.txt", ".env.local"),
    entry("C:\\Users\\u\\.AWS\\credentials", "alias.txt"), entry("nested/secret.json", "alias.txt"),
    entry(".ssh/id_ed25519.pub", "public.txt"), { receiptId: "opaque", name: "private.pem" },
    entry(".npmrc", "config.txt"), entry("nested/passwords.csv", "alias.txt")]) {
    await assert.rejects(readSelectedFiles([entry(), target], options), { code: "sensitive-file" });
  }
  assert.equal(reads, 0);
});

test("paths cannot select folders, URLs, network shares, globs or alternate streams", async () => {
  for (const path of ["https://example.com/a.txt", "file:///a.txt", "data:text/plain,a",
    "\\\\server\\a.txt", "//server/a.txt", "src/", "src\\", "src/*.js", "src/a?.js", ".", "..", "C:\\x.txt:secret", " x.txt"]) {
    await assert.rejects(readSelectedFiles([entry(path)], { readBytes: async () => encode("safe") }), { code: "invalid-file-path" });
  }
});

test("unsupported binary names, non-UTF8 and binary control bytes are rejected", async () => {
  let reads = 0;
  for (const name of ["image.PNG", "archive.zip", "report.pdf", "sheet.xlsx", "native.wasm"]) {
    await assert.rejects(readSelectedFiles([entry("source.txt", name)], { readBytes: async () => { reads++; return encode("ascii"); } }), { code: "unsupported-file" });
  }
  assert.equal(reads, 0);
  for (const bytes of [new Uint8Array([0xff]), new Uint8Array([65, 0, 66]), new Uint8Array([0x1b, 65])]) {
    await assert.rejects(readSelectedFiles([entry()], { readBytes: async () => bytes }), { code: "unsupported-file" });
  }
});

test("obvious secret content is rejected even under a harmless selected filename", async () => {
  const samples = ["-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----",
    "AKIA" + "X".repeat(16), "sk-" + "x".repeat(24), "password = \"" + "x".repeat(20) + "\""];
  for (const text of samples) await assert.rejects(readSelectedFiles([entry()], { readBytes: async () => encode(text) }), { code: "sensitive-file" });
});

test("injected I/O is mandatory and returns Uint8Array, never coerced text", async () => {
  await assert.rejects(readSelectedFiles([entry()]), { code: "file-reader-unavailable" });
  await assert.rejects(readSelectedFiles([{ receiptId: "r", name: "text.txt" }], { readBytes: async () => encode("no") }), { code: "file-reader-unavailable" });
  for (const value of ["text", [1, 2], new ArrayBuffer(2), null]) {
    await assert.rejects(readSelectedFiles([entry()], { readBytes: async () => value }), { code: "invalid-file-bytes" });
  }
  const empty = await readSelectedFiles([entry()], { readBytes: async () => new Uint8Array() });
  assert.equal(empty.files[0].text, ""); assert.equal(empty.files[0].bytes, 0);
});

test("file selection shape is explicit and one source only", async () => {
  for (const value of [null, {}, [null], [{ name: "x.txt" }], [{ path: "x", receiptId: "r", name: "x.txt" }],
    [{ path: "x", name: "" }], [{ path: "x", name: "x", recurse: true }], [{ receiptId: "", name: "x" }]]) {
    await assert.rejects(readSelectedFiles(value), { code: "invalid-file-entry" });
  }
});

test("abort before and during reads prevents subsequent files and partial success", async () => {
  const before = new AbortController(); before.abort();
  let reads = 0;
  await assert.rejects(readSelectedFiles([entry()], { signal: before.signal, readBytes: async () => { reads++; return encode("x"); } }), { code: "aborted" });
  assert.equal(reads, 0);
  const during = new AbortController();
  await assert.rejects(readSelectedFiles([entry(), entry("b.txt", "b.txt")], { signal: during.signal,
    readBytes: async () => { reads++; during.abort(); return encode("x"); },
  }), { code: "aborted" });
  assert.equal(reads, 1);
});

test("native size errors stay coded, upstream read errors are sanitized", async () => {
  for (const code of ["FS_TOO_LARGE", "file-too-large"]) {
    await assert.rejects(readSelectedFiles([entry()], { readBytes: async () => { throw Object.assign(new Error("raw path private"), { code }); } }),
      error => error.code === "file-too-large" && error.message === "file-too-large");
  }
  await assert.rejects(readSelectedFiles([entry()], { readBytes: async () => { throw new Error("SECRET upstream path token"); } }),
    error => error.code === "file-read-failed" && !error.message.includes("SECRET"));
});

test("selection and reader snapshots cannot expand or redirect while I/O awaits", async () => {
  const selected = [entry("a.txt", "A"), entry("b.txt", "B")];
  const calls = [];
  const options = { readBytes: async path => {
    calls.push(path);
    if (path === "a.txt") {
      selected[1].path = ".env"; selected[1].name = "changed";
      selected.push(entry("extra.txt", "extra"));
      options.readBytes = async () => { throw new Error("redirected reader"); };
    }
    return encode(path);
  } };
  const result = await readSelectedFiles(selected, options);
  assert.deepEqual(calls, ["a.txt", "b.txt"]);
  assert.deepEqual(result.files.map(file => file.name), ["A", "B"]);
});

test("Windows trailing dot/space aliases cannot hide sensitive path components", async () => {
  for (const path of ["dir/.ssh. /key.txt", "dir/.AWS ./not-obvious.txt", "dir/.git./config"]) {
    await assert.rejects(readSelectedFiles([entry(path)], { readBytes: async () => encode("safe") }), { code: "sensitive-file" });
  }
});

test("JSON credential values and ASCII binary signatures remain blocked", async () => {
  const token = JSON.stringify({ api_key: "x".repeat(20) });
  await assert.rejects(readSelectedFiles([entry()], { readBytes: async () => encode(token) }), { code: "sensitive-file" });
  for (const text of ["%PDF-1.7\nascii content", "GIF89aascii content"]) {
    await assert.rejects(readSelectedFiles([entry()], { readBytes: async () => encode(text) }), { code: "unsupported-file" });
  }
});

test("native remaining-budget size rejection is reported as total size overflow", async () => {
  let reads = 0;
  await assert.rejects(readSelectedFiles([entry("a", "a"), entry("b", "b"), entry("c", "c")], {
    readBytes: async (_path, _signal, maxBytes) => {
      reads++; if (maxBytes === 1) throw Object.assign(new Error("size"), { code: "FS_TOO_LARGE" });
      return new Uint8Array(FILE_BYTES).fill(120);
    },
  }), { code: "files-too-large" });
  assert.equal(reads, 3);
});

test("entry fields are snapshotted before validation and cannot change between validation and read", async () => {
  let accesses = 0;
  const target = { name: "visible.txt", get path() { accesses++; return accesses <= 2 ? "safe.txt" : ".env"; } };
  const calls = [];
  await readSelectedFiles([target], { readBytes: async path => { calls.push(path); return encode("safe"); } });
  assert.deepEqual(calls, ["safe.txt"]); assert.equal(accesses, 1);
});

test("adapter policy and receipt error codes survive without raw path or secret details", async () => {
  for (const code of ["sensitive-file", "not-a-file", "invalid-receipt", "unsupported-file", "invalid-file-path", "files-too-large"]) {
    const fail = async () => { throw Object.assign(new Error("RAW_PATH_SECRET_UPSTREAM"), { code }); };
    const entries = code === "invalid-receipt" ? [{ receiptId: "r1", name: "a.txt" }] : [entry()];
    await assert.rejects(readSelectedFiles(entries, { readBytes: fail, readReceipt: fail }),
      error => error.code === code && error.message === code && !error.message.includes("RAW_PATH"));
  }
});
