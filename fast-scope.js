/** Resolve only explicit live runtime ownership, never durable fork lineage. */
export function resolveFastPreference(agent, registry, readState) {
  if (!agent) return { enabled: false, inherited: false };
  const original = agent;
  const live = registry?.list() ?? [];
  const seen = new Set();
  while (agent && !seen.has(agent.id)) {
    seen.add(agent.id);
    const state = readState(agent);
    if (state?.explicit === true || state?.enabled === true) {
      return { enabled: state.enabled === true, inherited: agent !== original };
    }
    const owner = live.find(candidate => candidate !== agent && registry.isOwnedBy(agent.id, candidate));
    if (!owner) return { enabled: false, inherited: agent !== original };
    agent = owner;
  }
  return { enabled: false, inherited: agent !== original };
}
