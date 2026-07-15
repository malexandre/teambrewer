/**
 * A compact, human relative time ("just now", "5m ago", "2h ago", "3d ago"), falling back
 * to a localized calendar date for anything older than a week. `now` is injectable so
 * callers and tests stay free of any wall-clock dependence.
 */
export function formatRelativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const elapsedSeconds = Math.floor((now.getTime() - new Date(isoTimestamp).getTime()) / 1000);

  if (elapsedSeconds < 60) {
    return "just now";
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return `${elapsedDays}d ago`;
  }
  return new Date(isoTimestamp).toLocaleDateString();
}
