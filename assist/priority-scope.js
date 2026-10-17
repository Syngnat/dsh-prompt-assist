import { AsyncLocalStorage } from 'node:async_hooks';

const requests = new AsyncLocalStorage();
/** Own request metadata, never an unsupported provider payload field. */
export function runWithPriority(sessionId, fast, operation) {
  return requests.run(Object.freeze({ sessionId, fast: fast === true }), operation);
}
export function priorityOverride(sessionId) {
  const current = requests.getStore();
  return current?.sessionId === sessionId ? current.fast : undefined;
}
