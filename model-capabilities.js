const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const atPath = (value, path) => path.reduce((current, key) => current?.[key], value);

/** Correct exact declared model capabilities through Settings, never payload surgery. */
export async function applyModelCapabilities(ctx, specifications = []) {
  const results = [];
  for (const spec of specifications) {
    const result = { provider: spec.provider, model: spec.model, status: 'failed' };
    try {
      if (!spec.provider || !spec.model || !Array.isArray(spec.efforts) || !spec.efforts.length
        || spec.efforts.some(effort => !EFFORTS.has(effort))) throw new Error('invalid specification');
      const route = ctx.llm.listConfigurableProviders().find(entry => entry.provider === spec.provider);
      if (!route) { results.push({ ...result, status: 'not-configured' }); continue; }
      const descriptor = ctx.settings.describe({ redactSecrets: true }).find(entry => entry.ns === route.settingsNs);
      const models = atPath(descriptor?.value, route.settingsPath)?.models;
      const index = Array.isArray(models) ? models.findIndex(model => model.id === spec.model) : -1;
      if (!descriptor || index < 0) { results.push({ ...result, status: 'not-configured' }); continue; }
      const expected = Object.fromEntries(spec.efforts.map(effort => [effort, effort]));
      const previous = models[index].reasoningEfforts;
      const equal = previous && Object.keys(previous).length === Object.keys(expected).length
        && Object.entries(expected).every(([key, value]) => previous[key] === value);
      if (equal) { results.push({ ...result, status: 'unchanged' }); continue; }
      await ctx.settings.mutate(route.settingsNs, [{
        op: 'set', path: [...route.settingsPath, 'models', String(index), 'reasoningEfforts'], value: expected,
      }], descriptor.revision);
      results.push({ ...result, status: 'updated' });
    } catch {
      // Do not expose profile values, headers, credentials or provider diagnostics.
      results.push(result);
    }
  }
  return results;
}
