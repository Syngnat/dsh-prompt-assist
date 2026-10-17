import { isOpenAISelection, priorityPayload, SUPPORTED_APIS } from './policy.js';
import { priorityOverride } from './assist/priority-scope.js';
const OWNER = Symbol.for('@local/dsh-openai-fast/bridge/v1');

export function priorityModels(models) {
  return new Proxy(Object.create(null), {
    get(_target, key) {
      const value = Reflect.get(models, key, models);
      if (key !== 'streamSimple') return typeof value === 'function' ? value.bind(models) : value;
      return (model, context, options = {}) => {
        const previous = options.onPayload;
        return value.call(models, model, context, {
          ...options,
          async onPayload(body, resolvedModel) {
            const result = previous ? await previous(body, resolvedModel) : undefined;
            return priorityPayload(result === undefined ? body : result);
          },
        });
      };
    },
  });
}

/** Version-bound native adapter seam; payload transformation still adds only tier. */
export function installFastBridge(Adapter, enabledFor, providers) {
  const prototype = Adapter.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'streamWithSnapshot');
  const original = descriptor?.value;
  if (typeof original !== 'function' || original[OWNER] || typeof prototype.modelOf !== 'function'
    || !String(original).includes('snapshot.models.streamSimple')) {
    throw new Error('OpenAI Fast: incompatible pi-ai adapter; enablement refused');
  }
  let active = true;
  function streamWithFast(options, snapshot) {
    if (!active || options.purpose || !options.sessionId || !isOpenAISelection(options, providers)) {
      return original.call(this, options, snapshot);
    }
    const override = priorityOverride(options.sessionId);
    const enabled = override === undefined ? enabledFor(options.sessionId) : override;
    if (!enabled) return original.call(this, options, snapshot);
    const model = this.modelOf(snapshot, options.provider, options.model);
    if (!SUPPORTED_APIS.has(model.api)) throw new Error('OpenAI Fast: this route does not use a supported OpenAI API');
    return original.call(this, options, { ...snapshot, models: priorityModels(snapshot.models) });
  }
  Object.defineProperty(streamWithFast, OWNER, { value: true });
  Object.defineProperty(prototype, 'streamWithSnapshot', { ...descriptor, value: streamWithFast });
  return () => {
    active = false;
    if (prototype.streamWithSnapshot === streamWithFast) Object.defineProperty(prototype, 'streamWithSnapshot', descriptor);
  };
}

export { runWithPriority } from './assist/priority-scope.js';
