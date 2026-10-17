import { ASSIST_COMMAND, LEGACY_COMMAND } from './assist/identity.js';
import { createFast } from './client-fast-core.js';
const fast = createFast(require);
export const { derivePresentation, hydrateSession, createToggleController, quietCommandNames, HiddenFastCommand } = fast;
export const inject = [...fast.inject, 'connection', 'layout'];
export async function apply(ctx) {
  fast.apply(ctx);
  ctx.slots.inject('conversation.chat.commandview', () => [ASSIST_COMMAND, LEGACY_COMMAND].map(key => ctx.slots.register({ name: 'conversation.chat.commandview', key }, fast.HiddenFastCommand)));
  const { installAssist } = await import('./assist/client/index.js');
  return installAssist(ctx);
}
