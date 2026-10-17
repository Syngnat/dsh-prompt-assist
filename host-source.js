import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { resolveAdapterEntry } from "./adapter-locator.js";
import { apply as applyFast, inject as fastInject } from "./host-v1.0.4.js";
import { OpenAIFastService } from "./service-v2.js";
import { DEFAULT_PROVIDERS } from "./policy.js";
import { installAssistHost } from "./assist/bootstrap.js";
export const inject = [...fastInject, "webServer", "connection", "fs", "workingDirectory", "fileUploads", "attachments", "sessionController"];
export async function apply(ctx, config = {}) {
  const adapterEntry = await resolveAdapterEntry(ctx, config);
  await applyFast(ctx, { ...config, adapterEntry });
  const requireAdapter = createRequire(pathToFileURL(adapterEntry));
  const requireSchema = createRequire(requireAdapter.resolve("@deepseek-ai/schemastery"));
  const { z } = await import(pathToFileURL(requireSchema.resolve("zod")).href);
  const { createUserMessage } = await import(pathToFileURL(requireAdapter.resolve("@deepseek-ai/dsh-llm")).href);
  const providers = config.providers ?? [...DEFAULT_PROVIDERS];
  const fastService = new OpenAIFastService(ctx, providers, key => key);
  await installAssistHost(ctx, { z, fastService, providers, createUserMessage });
}
