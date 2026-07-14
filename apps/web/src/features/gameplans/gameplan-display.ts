import type { MetaDeckEntry } from "@teambrewer/shared";

import { matchupSubjectDisplayName } from "@/features/metas/meta-display";

/**
 * A meta deck entry's display name for game-plan assignment UIs — hero · label via the
 * shared single-source helper, falling back to the entry's stored snapshot label while
 * the hero list is still resolving.
 */
export function metaEntryDisplayName(
  entry: MetaDeckEntry,
  heroNamesById: Map<string, string>,
): string {
  const heroName = entry.heroId ? heroNamesById.get(entry.heroId) : undefined;
  return matchupSubjectDisplayName(heroName ?? null, entry.label) || entry.opponentSnapshotLabel;
}
