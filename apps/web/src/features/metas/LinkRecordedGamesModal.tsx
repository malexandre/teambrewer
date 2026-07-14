import { matchupSubjectDisplayName, type MetaDeckEntry } from "@teambrewer/shared";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useHeroes } from "@/features/cards/use-heroes";
import { formatPlayedAt, formatResult } from "@/features/game-logging/game-display";
import { ApiError } from "@/lib/api-client";

import { useLinkGamesToEntry } from "./use-meta-mutations";
import { useEntryLinkCandidates } from "./use-metas";

/**
 * A modal that retro-links a team's already-recorded games to a meta deck entry.
 * When opened for an `entry`, it lists the games whose opponent matches that entry's
 * hero/label and isn't yet linked to any meta deck — all selected by default, each
 * deselectable — and links the chosen ones on confirm (which then count toward that
 * entry's matchup). Opened both right after creating an entry (when candidates exist)
 * and on demand from the entry's controls.
 */
export function LinkRecordedGamesModal({
  teamId,
  metaId,
  entry,
  onClose,
}: {
  teamId: string | undefined;
  metaId: string;
  /** The entry to link games to, or null when the modal is closed. */
  entry: MetaDeckEntry | null;
  onClose: () => void;
}) {
  const open = Boolean(entry);
  const entryId = entry?.id ?? "";
  const candidates = useEntryLinkCandidates(teamId, metaId, entryId, { enabled: open });
  const linkGames = useLinkGamesToEntry(teamId, metaId, entryId);
  const games = candidates.data?.data ?? [];
  const { data: heroData } = useHeroes(teamId);
  const heroNameById = new Map((heroData?.data ?? []).map((hero) => [hero.id, hero.name]));

  // Default every candidate to selected whenever a fresh list loads.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (candidates.data) {
      setSelectedIds(new Set(candidates.data.data.map((game) => game.id)));
    }
  }, [candidates.data]);

  function toggle(gameId: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(gameId)) {
        next.delete(gameId);
      } else {
        next.add(gameId);
      }
      return next;
    });
  }

  function link(): void {
    const gameLogIds = [...selectedIds];
    if (gameLogIds.length === 0) {
      return;
    }
    linkGames.mutate({ gameLogIds }, { onSuccess: onClose });
  }

  const entryName = entry
    ? matchupSubjectDisplayName(
        entry.heroId ? heroNameById.get(entry.heroId) : undefined,
        entry.label,
      ) || entry.opponentSnapshotLabel
    : "";
  const title = entry ? `Link recorded games to ${entryName}` : "";

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          These recorded games match this deck and aren&apos;t linked to any meta deck yet. Linking
          them counts them toward this matchup.
        </p>

        {candidates.isPending ? (
          <p className="text-sm text-muted-foreground">Loading games…</p>
        ) : candidates.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load games.
          </p>
        ) : games.length === 0 ? (
          <p className="text-sm text-muted-foreground">No unlinked games match this deck.</p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-auto">
            {games.map((game) => (
              <li key={game.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(game.id)}
                    onChange={() => toggle(game.id)}
                  />
                  <span className="flex-1">{formatPlayedAt(game.playedAt)}</span>
                  <span className="font-medium">{formatResult(game.bestOf, game.result)}</span>
                  {(() => {
                    const opponentName = matchupSubjectDisplayName(
                      game.sideB.heroId ? heroNameById.get(game.sideB.heroId) : undefined,
                      game.sideB.archetypeLabel ?? "",
                    );
                    return opponentName ? (
                      <span className="text-muted-foreground">{opponentName}</span>
                    ) : null;
                  })()}
                </label>
              </li>
            ))}
          </ul>
        )}

        {linkGames.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {linkGames.error instanceof ApiError
              ? linkGames.error.message
              : "Could not link games."}
          </p>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={link}
            disabled={selectedIds.size === 0 || linkGames.isPending}
          >
            {selectedIds.size > 0 ? `Link ${selectedIds.size} game(s)` : "Link games"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
