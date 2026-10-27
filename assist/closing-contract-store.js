import { openBooleanSwitch } from "./boolean-switch-store.js";

/**
 * The closing-contract switch keeps its own storage domain. The flags and controls domains keep
 * their strict record shapes so an older build can still read them after a downgrade; this file is
 * simply absent for builds that never wrote it.
 */
export async function openClosingContract(ctx, z) {
  const store = await openBooleanSwitch(ctx, z, {
    prefix: "local_prompt_assist_final_answer_",
    field: "finalAnswer",
    initial: true,
  });
  return Object.freeze({
    getSnapshot: store.getSnapshot,
    setFinalAnswer: store.set,
    subscribe: store.subscribe,
    close: store.close,
  });
}
