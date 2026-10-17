/** Display elapsed whole seconds, discarding subsecond precision. */
export function formatDuration(milliseconds, unit) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '—';
  return String(Math.floor(milliseconds / 1000)) + unit;
}
