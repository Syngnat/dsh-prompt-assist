/** Bounded, process-local health reports from this plugin's own mounted control. */
export function createUiHealth() {
  const reports = new Map();
  return {
    read(agent) { return reports.get(agent?.id) ?? null; },
    report({ agent, rawInput }) {
      try {
        if (rawInput.length > 1024) throw new Error('report too large');
        const input = JSON.parse(rawInput);
        if (input.version !== '1.0.2' || typeof input.visible !== 'boolean'
          || typeof input.checked !== 'boolean') throw new Error('invalid report');
        const value = { version: input.version, visible: input.visible, checked: input.checked };
        for (const key of ['x', 'y', 'width', 'height']) {
          if (!Number.isFinite(input[key]) || Math.abs(input[key]) > 20000) throw new Error('invalid geometry');
          value[key] = input[key];
        }
        if (!reports.has(agent.id) && reports.size >= 512) reports.delete(reports.keys().next().value);
        reports.set(agent.id, value);
        return { kind: 'success' };
      } catch {
        return { kind: 'error', text: 'OpenAI Fast: invalid control health report' };
      }
    },
  };
}
