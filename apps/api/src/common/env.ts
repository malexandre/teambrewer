/**
 * Small helpers for reading numeric configuration from the environment with a
 * safe fallback. Rate-limit thresholds, windows, and similar tunables are
 * configurable via env (security.md, phase-13) so operators can tighten them per
 * deployment without a code change; an unset or malformed value falls back to the
 * documented default rather than crashing the process.
 */
export function readPositiveIntegerEnv(variableName: string, fallback: number): number {
  const rawValue = process.env[variableName];
  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }
  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue) || !Number.isInteger(parsedValue) || parsedValue <= 0) {
    return fallback;
  }
  return parsedValue;
}
