import type { MatchupGamePlan, MetaDeckEntry } from "@teambrewer/shared";
import { META_TIER_LABELS } from "@teambrewer/shared";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHeroes } from "@/features/cards/use-heroes";
import { matchupSubjectDisplayName, META_TIER_TONE } from "@/features/metas/meta-display";
import { ApiError } from "@/lib/api-client";

import { useUpdateGamePlan } from "./use-game-plan-mutations";

/**
 * Attach a game-plan to one or more of the current meta's deck entries. This realizes
 * "write the plan once, then point it at the specific decks it beats" — a plan may be a
 * broad label (e.g. "vs aggro") yet be assigned to the concrete meta entries it covers.
 *
 * The server keeps the attachment set via `metaDeckEntryIds` on the game-plan update
 * (R-1: passing the field **replaces** the whole set — see game-plans.ts). So attaching
 * adds an id to the current set and detaching removes one, each a single PATCH; the plan
 * row's refreshed `metaDeckEntryIds` drives what renders as attached.
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
  const update = useUpdateGamePlan(teamId, gamePlan.id);
  const { data: heroData } = useHeroes(teamId);
  const heroNamesById = useMemo(
    () => new Map((heroData?.data ?? []).map((hero) => [hero.id, hero.name])),
    [heroData],
  );

  /**
   * A meta entry's display name: the hero name (once the hero list resolves), then the
   * label. Falls back to the entry's stored snapshot label while heroes are still loading.
   */
  function entryDisplayName(entry: MetaDeckEntry): string {
    if (entry.heroId) {
      const heroName = heroNamesById.get(entry.heroId);
      if (!heroName) {
        return entry.opponentSnapshotLabel;
      }
      return matchupSubjectDisplayName(heroName, entry.label);
    }
    return matchupSubjectDisplayName(null, entry.label);
  }

  const attachedIds = gamePlan.metaDeckEntryIds;
  const attachedEntries = attachedIds.map((entryId) => ({
    entryId,
    entry: metaDeckEntries.find((candidate) => candidate.id === entryId) ?? null,
  }));
  const unattachedEntries = metaDeckEntries.filter((entry) => !attachedIds.includes(entry.id));

  function attach(entryId: string): void {
    update.mutate({ metaDeckEntryIds: [...attachedIds, entryId] });
  }

  function detach(entryId: string): void {
    update.mutate({ metaDeckEntryIds: attachedIds.filter((id) => id !== entryId) });
  }

  return (
    <div className="flex flex-col gap-2" aria-label="Meta deck assignment">
      <span className="text-xs font-semibold text-muted-foreground">
        Assigned meta decks{metaName ? ` · ${metaName}` : ""}
      </span>

      {attachedEntries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Not assigned to any meta deck yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {attachedEntries.map(({ entryId, entry }) => (
            <li key={entryId}>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                <span>{entry ? entryDisplayName(entry) : "Another meta's deck"}</span>
                {entry ? (
                  <Badge tone={META_TIER_TONE[entry.tier]} size="sm">
                    {META_TIER_LABELS[entry.tier]}
                  </Badge>
                ) : null}
                <button
                  type="button"
                  aria-label={`Unassign ${entry ? entryDisplayName(entry) : "meta deck"}`}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  disabled={update.isPending}
                  onClick={() => detach(entryId)}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {metaDeckEntries.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No current meta deck list to assign to. Create a meta with a tiered deck list.
        </p>
      ) : unattachedEntries.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">Assign:</span>
          {unattachedEntries.map((entry) => (
            <Button
              key={entry.id}
              type="button"
              size="sm"
              variant="outline"
              disabled={update.isPending}
              onClick={() => attach(entry.id)}
            >
              + {entryDisplayName(entry)}
            </Button>
          ))}
        </div>
      ) : null}

      {update.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {update.error instanceof ApiError
            ? update.error.message
            : "Could not update the assignment."}
        </p>
      ) : null}
    </div>
  );
}
