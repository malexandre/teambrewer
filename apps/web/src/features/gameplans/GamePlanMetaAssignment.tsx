import type { MatchupGamePlan, MetaDeckEntry } from "@teambrewer/shared";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { useHeroes } from "@/features/cards/use-heroes";
import { META_TIER_TONE } from "@/features/metas/meta-display";

import { metaEntryDisplayName } from "./gameplan-display";

/**
 * Read-only display of which of the current meta's decks a game-plan covers, shown on
 * the plan card. Editing the assignment now lives in the plan's editor (a multi-select),
 * so this is purely a summary: tier-colored chips per covered entry, plus a count of any
 * assignments that belong to a different (e.g. older) meta and so aren't resolvable here.
 */
export function GamePlanMetaAssignment({
  teamId,
  gamePlan,
  metaName,
  metaDeckEntries,
}: {
  teamId: string | undefined;
  gamePlan: MatchupGamePlan;
  metaName: string | null;
  metaDeckEntries: MetaDeckEntry[];
}) {
  const { data: heroData } = useHeroes(teamId);
  const heroNamesById = useMemo(
    () => new Map((heroData?.data ?? []).map((hero) => [hero.id, hero.name])),
    [heroData],
  );

  const attachedIds = gamePlan.metaDeckEntryIds;
  if (attachedIds.length === 0) {
    return null;
  }

  const entriesById = new Map(metaDeckEntries.map((entry) => [entry.id, entry]));
  const resolved = attachedIds
    .map((id) => entriesById.get(id))
    .filter((entry): entry is MetaDeckEntry => entry !== undefined);
  const otherMetaCount = attachedIds.length - resolved.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">
        Covers{metaName ? ` · ${metaName}` : ""}:
      </span>
      {resolved.map((entry) => (
        <Badge key={entry.id} tone={META_TIER_TONE[entry.tier]} size="sm" dot>
          {metaEntryDisplayName(entry, heroNamesById)}
        </Badge>
      ))}
      {otherMetaCount > 0 ? (
        <Badge tone="neutral" size="sm" title="Assigned in another meta">
          +{otherMetaCount} in another meta
        </Badge>
      ) : null}
    </div>
  );
}
