import { createRequire } from "node:module";
import { isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ADAPTER_PACKAGE = "@deepseek-ai/dsh-llm-pi-ai";
const BOOT_PACKAGE = "@deepseek-ai/dsh-app-boot";
const localRequire = createRequire(import.meta.url);

function invalidEntry(cause) {
  return Object.assign(new Error("OpenAI Fast: adapterEntry must be a local module path or file URL.", { cause }), { code: "adapter-entry-invalid" });
}

function localEntry(value, allowRelative = false) {
  if (typeof value !== "string" || !value || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) throw invalidEntry();
  try {
    if (value.startsWith("file:")) return fileURLToPath(new URL(value));
    if (/^[a-z][a-z\d+.-]*:/iu.test(value) && !/^[a-z]:[\\/]/iu.test(value)) throw invalidEntry();
    if (!allowRelative && !isAbsolute(value)) throw invalidEntry();
    return fileURLToPath(pathToFileURL(value));
  } catch (cause) { throw invalidEntry(cause); }
}

/**
 * Prefer public Host resolution: Loader.import + app-boot.resolvePluginResource.
 * This uses the running DSH installation/runtime table, including Desktop ASAR.
 * Plain Node embedders without a Loader use ordinary Node package resolution.
 * Explicit overrides stay authoritative; failed Host lookup never tries another copy.
 */
export async function resolveAdapterEntry(ctx, config = {}, options = {}) {
  if (config && Object.hasOwn(config, "adapterEntry")) return localEntry(config.adapterEntry, true);
  const resolveNode = options.resolveNode ?? (specifier => localRequire.resolve(specifier));
  try {
    const loader = typeof ctx?.get === "function" ? ctx.get("loader") : ctx?.loader;
    if (typeof loader?.import === "function") {
      const boot = await loader.import(BOOT_PACKAGE);
      if (typeof boot?.resolvePluginResource !== "function") throw new Error("Host resource resolver is unavailable");
      return localEntry(await boot.resolvePluginResource(ADAPTER_PACKAGE, ctx?.baseUrl ?? import.meta.url));
    }
    return localEntry(await resolveNode(ADAPTER_PACKAGE));
  } catch (cause) {
    throw Object.assign(new Error(
      "OpenAI Fast: cannot locate the installed DSH adapter; enable @deepseek-ai/dsh-llm-pi-ai or set config.adapterEntry.",
      { cause },
    ), { code: "adapter-unavailable" });
  }
}
