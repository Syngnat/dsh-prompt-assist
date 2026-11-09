import { openBooleanSwitch } from "./boolean-switch-store.js";

/**
 * Progress narration is an independent profile-global switch, stored in its own domain so the
 * existing flags, closing-contract and controls record shapes stay unchanged. Older builds never
 * open this domain, and this build can still read profiles that never wrote it (default on).
 */
export async function openProcessFeedback(ctx, z) {
  const store = await openBooleanSwitch(ctx, z, {
    prefix: "local_prompt_assist_process_feedback_",
    field: "processFeedback",
    initial: true,
  });
  return Object.freeze({
    getSnapshot: store.getSnapshot,
    setProcessFeedback: store.set,
    subscribe: store.subscribe,
    close: store.close,
  });
}
