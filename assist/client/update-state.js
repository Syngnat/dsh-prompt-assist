export const UPDATE_ENDPOINT = "/api/local-openai-fast.updates";
export const INSTALL_SPEC = "github:Syngnat/dsh-prompt-assist";
const STATUSES = new Set(["idle", "current", "update-available", "ahead", "error"]);
const ERRORS = new Set(["network", "timeout", "rate-limited", "not-found", "invalid-response"]);
const VERSION = /^v?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/;
const version = value => typeof value === "string" && value.length <= 80 && VERSION.test(value);
const invalid = () => Object.assign(new Error("invalid-response"), {code: "invalid-response"});

export function safeReleaseUrl(value) {
  if (typeof value !== "string" || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port
      || url.username || url.password || url.search || url.hash) return null;
    const parts = url.pathname.split("/");
    if (parts.length !== 6 || parts[1].toLowerCase() !== "syngnat"
      || parts[2].toLowerCase() !== "dsh-prompt-assist" || parts[3] !== "releases" || parts[4] !== "tag") return null;
    const tag = decodeURIComponent(parts[5]);
    if (!/^v?\d+\.\d+\.\d+(?:\+[a-zA-Z0-9.-]+)?$/.test(tag)) return null;
    return url.href;
  } catch { return null; }
}

export function formatCheckedAt(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Human-readable UTC stamp: the label says UTC, so the display must not depend on the viewer's zone. */
function stamp(date, utc) {
  const pad = number => String(number).padStart(2, "0");
  const parts = utc
    ? [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
    : [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
  return parts[0] + "-" + pad(parts[1]) + "-" + pad(parts[2]) + " " + pad(parts[3]) + ":" + pad(parts[4]) + ":" + pad(parts[5]);
}

/** "Last check" is a wall-clock moment for the reader, so it follows the machine zone. */
export function displayCheckedAt(value) {
  const iso = formatCheckedAt(value);
  return iso ? stamp(new Date(iso), false) : null;
}

/** Absolute deadlines (confirmation expiry) stay in UTC and say so. */
export function displayUtcTime(value) {
  const iso = formatCheckedAt(value);
  return iso ? stamp(new Date(iso), true) + " UTC" : "";
}

/** Pick only the public contract. Never trust a remote installation target or HTML. */
export function normalizeUpdateState(value) {
  if (!value || typeof value !== "object" || !version(value.currentVersion) || !STATUSES.has(value.status)) throw invalid();
  if (value.latestVersion !== null && (!version(value.latestVersion) || !/^v?\d+\.\d+\.\d+(?:\+[a-zA-Z0-9.-]+)?$/.test(value.latestVersion))) throw invalid();
  if (value.checkedAt !== null && formatCheckedAt(value.checkedAt) === null) throw invalid();
  if (value.error !== null && !ERRORS.has(value.error)) throw invalid();
  if ((value.status === "error") !== (value.error !== null)) throw invalid();
  if (["current", "update-available", "ahead"].includes(value.status)
    && (!value.latestVersion || value.checkedAt === null)) throw invalid();
  return Object.freeze({
    currentVersion: value.currentVersion, status: value.status, latestVersion: value.latestVersion,
    releaseUrl: safeReleaseUrl(value.releaseUrl), checkedAt: value.checkedAt, error: value.error, installSpec: INSTALL_SPEC,
  });
}

export function initialUpdateSnapshot() {
  return {data: null, pending: "load", localError: null, cancelled: false};
}

export function updateDisplay(snapshot) {
  const error = snapshot.localError ?? (snapshot.data?.status === "error" ? snapshot.data.error : null);
  const status = snapshot.pending === "check" ? "checking" : snapshot.pending === "load" ? "loading"
    : snapshot.cancelled ? "cancelled" : error ? "error" : snapshot.data?.status ?? "idle";
  return {status, error, message: "updates." + status, releaseUrl: safeReleaseUrl(snapshot.data?.releaseUrl),
    checkedAt: formatCheckedAt(snapshot.data?.checkedAt)};
}

/** GET only reads Host cache. Only an explicit check() may POST to the Host. */
export function createUpdateController(fetcher = globalThis.fetch) {
  let state = initialUpdateSnapshot();
  let disposed = true;
  let epoch = 0;
  let flight = null;
  const listeners = new Set();
  const publish = patch => {state = {...state, ...patch}; for (const listener of listeners) listener();};
  const invalidate = () => {epoch += 1; flight?.abort(); flight = null;};
  async function request(method) {
    if (disposed || (method === "POST" && state.pending === "check")) return false;
    invalidate();
    const revision = epoch;
    const abort = new AbortController();
    flight = abort;
    publish({pending: method === "POST" ? "check" : "load", localError: null, cancelled: false});
    try {
      const response = await fetcher(UPDATE_ENDPOINT, {method, credentials: "same-origin", signal: abort.signal,
        ...(method === "POST" ? {headers: {"Content-Type": "application/json"}, body: "{}"} : {})});
      let body;
      try { body = await response.json(); } catch { throw invalid(); }
      const data = normalizeUpdateState(body);
      if (!response.ok && data.status !== "error") throw invalid();
      if (disposed || abort.signal.aborted || epoch !== revision) return false;
      publish({data, localError: null});
      return true;
    } catch (error) {
      if (disposed || abort.signal.aborted || epoch !== revision) return false;
      const code = ERRORS.has(error?.code) ? error.code : error?.name === "TimeoutError" ? "timeout" : "network";
      publish({localError: code});
      return false;
    } finally {
      if (!disposed && epoch === revision) {flight = null; publish({pending: null});}
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) {listeners.add(listener); return () => listeners.delete(listener);},
    start() {disposed = false; return request("GET");},
    load() {return request("GET");},
    check() {return request("POST");},
    cancel() {if (!disposed) {invalidate(); publish({pending: null, cancelled: true, localError: null});}},
    dispose() {disposed = true; invalidate();},
  };
}

export async function copyInstallSpec(clipboard = globalThis.navigator?.clipboard) {
  if (typeof clipboard?.writeText !== "function") throw new Error("clipboard-unavailable");
  await clipboard.writeText(INSTALL_SPEC);
}
