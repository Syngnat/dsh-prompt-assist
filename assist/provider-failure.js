/** Only bounded native failure categories cross the plugin boundary, never provider prose. */
const NATIVE_CODES = Object.freeze({
  CONTEXT_WINDOW_EXCEEDED: 'context-overflow', EMPTY_RESPONSE: 'empty-result',
  QUOTA: 'provider-quota', ACCOUNT_QUOTA: 'provider-quota',
  AUTH: 'provider-access-denied', RATE_LIMIT: 'provider-rate-limited',
  INVALID_REQUEST: 'provider-rejected', SERVER: 'provider-unavailable',
  TIMEOUT: 'provider-timeout', TRANSPORT: 'provider-transport',
  STREAM_CLOSED: 'provider-stream-incomplete', MALFORMED_RESPONSE: 'provider-response-invalid',
  PI_AI_ERROR: 'provider-response-error',
});
const KEYS = Object.freeze({
  'provider-quota':'providerQuota', 'provider-access-denied':'providerAccessDenied',
  'provider-rate-limited':'providerRateLimited', 'provider-rejected':'providerRejected',
  'provider-unavailable':'providerUnavailable', 'provider-timeout':'providerTimeout',
  'provider-transport':'providerTransport', 'provider-stream-incomplete':'providerStreamIncomplete',
  'provider-response-invalid':'providerResponseInvalid', 'provider-response-error':'providerResponseError',
});
export function providerHttpStatus(code) {
  return typeof code === 'string' && /^provider-http-[45]\d{2}$/.test(code) ? Number(code.slice(-3)) : null;
}
export function isProviderFailureCode(code) {
  return typeof code === 'string' && (Object.hasOwn(KEYS,code) || providerHttpStatus(code)!==null);
}
export function providerFailureCode(value) {
  const code = value?.code;
  // Preserve semantic context/empty/quota categories over an ambiguous HTTP 400/429.
  if (['CONTEXT_WINDOW_EXCEEDED','EMPTY_RESPONSE','QUOTA','ACCOUNT_QUOTA'].includes(code)) return NATIVE_CODES[code];
  const status = value?.status;
  if (Number.isInteger(status) && status>=400 && status<=599) return `provider-http-${status}`;
  return typeof code === 'string' && Object.hasOwn(NATIVE_CODES,code) ? NATIVE_CODES[code] : 'model-failed';
}
export function providerErrorKey(code) {
  if (typeof code==='string' && Object.hasOwn(KEYS,code)) return KEYS[code];
  const status=providerHttpStatus(code);
  if(status===null)return null;
  if(status===401||status===403)return 'providerAccessDenied';
  if(status===408||status===504)return 'providerTimeout';
  if(status===413)return 'providerRequestTooLarge';
  if(status===429)return 'providerRateLimited';
  return status>=500?'providerUnavailable':'providerRejected';
}
