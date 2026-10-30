/** Auxiliary feature settings never inherit the main model Fast preference. */
export const DEFAULT_CONFIG = Object.freeze({
  enabled: false, followSession: true, provider: "", model: "",
  reasoningEffort: "", fast: false, rounds: 1, autoApply: true, streamWrite: false,
});

function invalid(code) {
  return Object.assign(new Error(code), { code });
}

/** Validate without coercion, clamping, or changing native reasoning-effort IDs. */
export function normalizeConfig(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid("invalid-config");
  if (Object.keys(input).some(key => !Object.hasOwn(DEFAULT_CONFIG, key))) throw invalid("invalid-config");
  const config = { ...DEFAULT_CONFIG, ...input };
  for (const [key, code] of [
    ["enabled", "invalid-enabled"], ["followSession", "invalid-follow-session"], ["fast", "invalid-fast"],
    ["autoApply", "invalid-auto-apply"], ["streamWrite", "invalid-stream-write"],
  ]) {
    if (typeof config[key] !== "boolean") throw invalid(code);
  }
  for (const [key, code] of [
    ["provider", "invalid-provider"], ["model", "invalid-model"], ["reasoningEffort", "invalid-effort"],
  ]) {
    if (typeof config[key] !== "string" || config[key].length > 256
      || config[key] !== config[key].trim() || /[\u0000-\u001f\u007f]/u.test(config[key])) throw invalid(code);
  }
  if (!Number.isInteger(config.rounds) || config.rounds < 1 || config.rounds > 20) throw invalid("invalid-rounds");
  if (config.enabled && !config.followSession && (!config.provider || !config.model)) throw invalid("model-required");
  return config;
}

/** Session controls stay distinct. The legacy enabled field is replay-compatible, not profile authority. */
export function initialSettings() {
  return { suggest: normalizeConfig(), enhance: normalizeConfig() };
}

export const initialConfigs = initialSettings;
