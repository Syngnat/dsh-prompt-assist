import semver from "semver";

export const RELEASE_API = "https://api.github.com/repos/Syngnat/dsh-prompt-assist/releases/latest";
export const INSTALL_SPEC = "github:Syngnat/dsh-prompt-assist";
export const CHECK_TIMEOUT_MS = 10000;
export const CHECK_COOLDOWN_MS = 30000;
export const MAX_RESPONSE_BYTES = 262144;
const RELEASE_PREFIX = "/syngnat/dsh-prompt-assist/releases/tag/";

class CheckFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
const failure = code => new CheckFailure(code);

function cancelBody(response) {
  try { void Promise.resolve(response.body?.cancel()).catch(() => {}); } catch {}
}

/** Never buffer an unbounded response or expose GitHub response text to callers. */
async function boundedJSON(response, signal) {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) throw failure("invalid-response");
  const reader = response.body?.getReader();
  if (!reader) throw failure("invalid-response");
  const chunks = []; let bytes = 0, complete = false;
  const abort = () => { try { void reader.cancel().catch(() => {}); } catch {} };
  signal.addEventListener("abort", abort, { once: true });
  try {
    for (;;) {
      signal.throwIfAborted();
      const value = await reader.read(); signal.throwIfAborted();
      if (value.done) { complete = true; break; }
      if (!(value.value instanceof Uint8Array)) throw failure("invalid-response");
      bytes += value.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw failure("invalid-response");
      chunks.push(value.value);
    }
    const body = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
    catch { throw failure("invalid-response"); }
  } finally {
    signal.removeEventListener("abort", abort);
    if (!complete) abort();
    try { reader.releaseLock(); } catch {}
  }
}

function stableRelease(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.draft !== false || value.prerelease !== false) throw failure("invalid-response");
  const tag = value.tag_name;
  if (typeof tag !== "string" || tag.length > 200 || tag !== tag.trim()) throw failure("invalid-response");
  const raw = tag.startsWith("v") ? tag.slice(1) : tag;
  const parsed = /^\d/u.test(raw) ? semver.parse(raw, { loose: false }) : null;
  if (!parsed || parsed.prerelease.length) throw failure("invalid-response");
  if (typeof value.html_url !== "string" || value.html_url.length > 1024 || value.html_url !== value.html_url.trim()) throw failure("invalid-response");
  try {
    const url = new URL(value.html_url);
    if (url.protocol !== "https:" || url.host !== "github.com" || url.username || url.password || url.search || url.hash
      || !url.pathname.toLowerCase().startsWith(RELEASE_PREFIX)) throw failure("invalid-response");
    const suffix = url.pathname.slice(RELEASE_PREFIX.length);
    if (suffix.includes("/") || decodeURIComponent(suffix) !== tag) throw failure("invalid-response");
  } catch { throw failure("invalid-response"); }
  return { latestVersion: parsed.version, releaseUrl: `https://github.com/Syngnat/dsh-prompt-assist/releases/tag/${encodeURIComponent(tag)}` };
}

/** Process-local, explicit-only stable release checks; no install or download operation. */
export class UpdateService {
  constructor({ currentVersion, fetch: fetcher = (...args) => globalThis.fetch(...args), clock = Date.now,
    setTimer = setTimeout, clearTimer = clearTimeout, timeoutMs = CHECK_TIMEOUT_MS, cooldownMs = CHECK_COOLDOWN_MS } = {}) {
    if (typeof currentVersion !== "string" || !semver.valid(currentVersion, { loose: false })) throw new Error("Invalid current plugin version");
    if (typeof fetcher !== "function" || typeof clock !== "function" || typeof setTimer !== "function" || typeof clearTimer !== "function"
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > CHECK_TIMEOUT_MS
      || !Number.isSafeInteger(cooldownMs) || cooldownMs < 0) throw new Error("Invalid update check dependencies");
    this.fetcher = fetcher; this.clock = clock; this.setTimer = setTimer; this.clearTimer = clearTimer;
    this.timeoutMs = timeoutMs; this.cooldownMs = cooldownMs; this.active = null; this.disposed = false; this.lastStarted = -Infinity;
    this.value = Object.freeze({ currentVersion, status: "idle", latestVersion: null, releaseUrl: null, checkedAt: null, error: null, installSpec: INSTALL_SPEC });
  }

  status() { return Object.freeze({ ...this.value }); }

  fail(code) {
    this.value = Object.freeze({ ...this.value, status: "error", latestVersion: null, releaseUrl: null, checkedAt: this.clock(), error: code });
    return this.status();
  }

  async release(signal) {
    signal.throwIfAborted();
    const response = await this.fetcher(RELEASE_API, { method: "GET", redirect: "manual", credentials: "omit",
      referrerPolicy: "no-referrer", cache: "no-store", headers: { "User-Agent": "dsh-prompt-assist-update-check" }, signal });
    try {
      signal.throwIfAborted();
      if (!response || typeof response.status !== "number" || typeof response.headers?.get !== "function") throw failure("invalid-response");
      if (response.redirected || (response.url && response.url !== RELEASE_API) || (response.status >= 300 && response.status < 400)) throw failure("invalid-response");
      if (response.status === 403 || response.status === 429) throw failure("rate-limited");
      if (response.status === 404) throw failure("not-found");
      if (response.status >= 500) throw failure("network");
      if (response.status !== 200) throw failure("invalid-response");
      const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      if (!["application/json", "application/vnd.github+json"].includes(type)) throw failure("invalid-response");
      return stableRelease(await boundedJSON(response, signal));
    } catch (error) { cancelBody(response); throw error; }
  }

  check() {
    if (this.disposed) return Promise.resolve(this.fail("network"));
    if (this.active) return this.active.promise;
    const elapsed = this.clock() - this.lastStarted;
    if (this.value.checkedAt !== null && elapsed >= 0 && elapsed < this.cooldownMs) return Promise.resolve(this.status());
    this.lastStarted = this.clock();
    const controller = new AbortController(); let abort;
    const aborted = new Promise((_, reject) => {
      abort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", abort, { once: true });
    });
    const job = { controller, promise: null }; this.active = job;
    const timer = this.setTimer(() => controller.abort(failure("timeout")), this.timeoutMs);
    job.promise = Promise.race([Promise.resolve().then(() => this.release(controller.signal)), aborted]).then(release => {
      controller.signal.throwIfAborted();
      const order = semver.compare(release.latestVersion, this.value.currentVersion);
      this.value = Object.freeze({ ...this.value, ...release, status: order > 0 ? "update-available" : order < 0 ? "ahead" : "current", checkedAt: this.clock(), error: null });
      return this.status();
    }).catch(error => this.fail(error instanceof CheckFailure ? error.code : "network")).finally(() => {
      this.clearTimer(timer); controller.signal.removeEventListener("abort", abort); controller.abort();
      if (this.active === job) this.active = null;
    });
    return job.promise;
  }

  dispose() { this.disposed = true; this.active?.controller.abort(failure("network")); }
}
