/**
 * The pure "current meta" resolution rule (docs/features/metas.md,
 * docs/decisions/0010-meta-as-organizing-hub.md). A meta is *current* when today
 * falls within its `[startDate, endDate]` window; when several windows overlap
 * today, the one with the latest `startDate` wins (a freshly-started meta
 * supersedes an older, longer one still running). Kept pure and free of Prisma so
 * it can be unit-tested against crafted date sets (overlaps, boundaries, none).
 *
 * Windows are day-bounded, not instant-bounded: a meta's boundaries are stored at
 * UTC midnight (from a date-only input), so the comparison is done at UTC-day
 * granularity. Otherwise a meta whose `endDate` is today at 00:00 would stop being
 * current at 00:01, dropping its own final day.
 */

/** The minimum a meta must expose for the current-meta rule (order-independent). */
export interface CurrentMetaCandidate {
  id: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
}

/** Truncate a `Date` to the UTC calendar day it falls on (time set to 00:00:00Z). */
function toUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Resolve the current meta from a set of (already team-scoped, non-archived)
 * candidates as of `now`, or `null` when none contains today. On overlap the
 * latest `startDate` wins; ties break by the most recently created meta, then by
 * id, so the result is deterministic.
 */
export function resolveCurrentMeta<CandidateType extends CurrentMetaCandidate>(
  candidates: readonly CandidateType[],
  now: Date,
): CandidateType | null {
  const today = toUtcDay(now);
  const containing = candidates.filter(
    (candidate) => toUtcDay(candidate.startDate) <= today && toUtcDay(candidate.endDate) >= today,
  );
  if (containing.length === 0) {
    return null;
  }
  return [...containing].sort(compareByCurrentPriority)[0] ?? null;
}

/** Sort so the winning current meta (latest start, then newest, then id) is first. */
function compareByCurrentPriority(left: CurrentMetaCandidate, right: CurrentMetaCandidate): number {
  const byStartDate = right.startDate.getTime() - left.startDate.getTime();
  if (byStartDate !== 0) {
    return byStartDate;
  }
  const byCreatedAt = right.createdAt.getTime() - left.createdAt.getTime();
  if (byCreatedAt !== 0) {
    return byCreatedAt;
  }
  return right.id.localeCompare(left.id);
}
