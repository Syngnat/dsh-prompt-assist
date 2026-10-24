import {installUpdateHost} from './updates/host.js';
import {assertRuntimeContract} from './runtime-contract.js';
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolveAdapterEntry } from "./adapter-locator.js";
import { apply as applyFast, inject as fastInject } from "./host-v1.0.4.js";
import { OpenAIFastService } from "./service-v2.js";
import { DEFAULT_PROVIDERS, mergeProviders } from "./policy.js";
import { installAssistHost } from "./assist/bootstrap.js";
import { installFinalAnswerContract } from "./assist/final-answer-contract.js";
import { openPriorityProviders } from "./assist/priority-providers.js";
import { installPriorityRpc } from "./assist/priority-transport.js";
export const inject = [...fastInject, "webServer", "connection", "fs", "workingDirectory", "fileUploads", "attachments", "sessionController", "storageDomain", "profileContext"];
export async function apply(ctx, config = {}) {
  assertRuntimeContract(ctx);
  const adapterEntry = await resolveAdapterEntry(ctx, config);
  const requireAdapter = createRequire(pathToFileURL(adapterEntry));
  const requireSchema = createRequire(requireAdapter.resolve("@deepseek-ai/schemastery"));
  const { z } = await import(pathToFileURL(requireSchema.resolve("zod")).href);
  const { createUserMessage } = await import(pathToFileURL(requireAdapter.resolve("@deepseek-ai/dsh-llm")).href);
  const configured = config.providers ?? [...DEFAULT_PROVIDERS];
  if (!Array.isArray(configured) || configured.some(value => typeof value !== "string" || !value)) {
    throw new Error("OpenAI Fast: providers must contain explicit non-empty route IDs");
  }
  // Package configuration stays the baseline; a profile may only add providers through the audited
  // authorization store, and every read goes through this single resolver.
  const priority = await openPriorityProviders(ctx, z, configured);
  ctx.effect(() => () => priority.close());
  const providers = () => mergeProviders(configured, priority.snapshot().authorized);
  await applyFast(ctx, { ...config, adapterEntry, providers });
  const fastService = new OpenAIFastService(ctx, providers, key => key);
  const assist = await installAssistHost(ctx, { z, fastService, providers, createUserMessage });
  // Liangshen's minimal prompt drops every non-allowlisted system-prompt section, so the Codex-style
  // closing contract rides the pre-step decision as a durable user reminder instead.
  // Package config is the hard switch; the profile toggle is read live so the settings page applies at once.
  const disposeContract = installFinalAnswerContract(ctx, { createUserMessage,
    enabled: () => config.finalAnswerContract !== false && assist?.enablement?.getSnapshot?.()?.finalAnswer !== false });
  ctx.effect(() => () => disposeContract());
  installPriorityRpc(ctx, priority, configured);
  installUpdateHost(ctx);
}
