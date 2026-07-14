import { useNavigate } from "@tanstack/react-router";
import {
  type GameLogDetail as GameLogDetailType,
  PLAYER_CATEGORY_LABELS,
} from "@teambrewer/shared";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { useHeroes } from "@/features/cards/use-heroes";
import { ActivityFeed } from "@/features/collaboration/ActivityFeed";
import { CommentThread } from "@/features/collaboration/CommentThread";
import { useDecks } from "@/features/decks/use-decks";
import { matchupSubjectDisplayName } from "@/features/metas/meta-display";
import { useMetaDeckEntriesByMeta, useMetas } from "@/features/metas/use-metas";
import { ApiError } from "@/lib/api-client";

import {
  DECK_MATURITY_FIELD,
  describeOpponent,
  describeSelf,
  formatConfidenceWeight,
  formatPlayedAt,
  formatResult,
  GAME_LOG_CARD_SIDE_LABELS,
  type GameLogLabelMaps,
  PILOT_FAMILIARITY_FIELD,
  SERIOUSNESS_FIELD,
  SKILL_PARITY_FIELD,
} from "./game-display";
import { useArchiveGame } from "./use-game-mutations";

function optionLabel<Value extends string>(
  field: { options: { value: Value; label: string }[] },
  value: Value,
): string {
  return field.options.find((option) => option.value === value)?.label ?? value;
}

/**
 * A game log's detail: the header (matchup, result, first player, confidence weight
 * + factors), plus the shared comment thread and activity feed. The logger or a
 * team-admin may edit (on the dedicated edit route) or archive.
 */
export function GameDetail({
  teamId,
  game,
}: {
  teamId: string | undefined;
  game: GameLogDetailType;
}) {
  const navigate = useNavigate();
  const archiveGame = useArchiveGame(teamId, game.id);

  const { data: decks } = useDecks(teamId, {});
  const { data: heroes } = useHeroes(teamId);
  const { data: metas } = useMetas(teamId);
  const metaEntriesById = useMetaDeckEntriesByMeta(
    teamId,
    (metas?.data ?? []).map((meta) => meta.id),
  );

  const maps: GameLogLabelMaps = useMemo(() => {
    const heroesMap = Object.fromEntries((heroes?.data ?? []).map((h) => [h.id, h.name]));
    const metaEntries: Record<string, string> = {};
    for (const entry of metaEntriesById.values()) {
      metaEntries[entry.id] =
        matchupSubjectDisplayName(
          entry.heroId ? heroesMap[entry.heroId] : undefined,
          entry.label,
        ) || entry.opponentSnapshotLabel;
    }
    return {
      decks: Object.fromEntries((decks?.data ?? []).map((d) => [d.id, d.name])),
      heroes: heroesMap,
      metaEntries,
    };
  }, [decks, heroes, metaEntriesById]);

  function archive() {
    if (!window.confirm("Archive this game? It will be hidden but its history is kept.")) return;
    archiveGame.mutate(undefined, { onSuccess: () => void navigate({ to: "/games" }) });
  }

  const ourDeck = describeSelf(game.sideA, maps);
  const opponent = describeOpponent(game.sideB, maps);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${ourDeck} vs ${opponent}`}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void navigate({ to: "/games/$gameLogId/edit", params: { gameLogId: game.id } })
              }
            >
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={archive} disabled={archiveGame.isPending}>
              Archive
            </Button>
          </>
        }
      />

      {archiveGame.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {archiveGame.error instanceof ApiError ? archiveGame.error.message : "Could not archive."}
        </p>
      ) : null}

      <Section title="Result" aria-label="Result">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Result</dt>
            <dd>{formatResult(game.bestOf, game.result)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Confidence weight</dt>
            <dd>~{formatConfidenceWeight(game.confidenceWeight)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">First player</dt>
            <dd>{game.firstPlayerSide === "A" ? ourDeck : opponent}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Played</dt>
            <dd>{formatPlayedAt(game.playedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">You (piloted by)</dt>
            <dd>{PLAYER_CATEGORY_LABELS[game.sideA.playerCategory]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Opponent</dt>
            <dd>{PLAYER_CATEGORY_LABELS[game.sideB.playerCategory]}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Confidence factors" aria-label="Confidence factors">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{SKILL_PARITY_FIELD.label}</dt>
            <dd>{optionLabel(SKILL_PARITY_FIELD, game.confidenceFactors.skillParity)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{SERIOUSNESS_FIELD.label}</dt>
            <dd>{optionLabel(SERIOUSNESS_FIELD, game.confidenceFactors.seriousness)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{DECK_MATURITY_FIELD.label}</dt>
            <dd>{optionLabel(DECK_MATURITY_FIELD, game.confidenceFactors.deckMaturity)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{PILOT_FAMILIARITY_FIELD.label}</dt>
            <dd>{optionLabel(PILOT_FAMILIARITY_FIELD, game.confidenceFactors.pilotFamiliarity)}</dd>
          </div>
        </dl>
      </Section>

      {game.learnings || game.impressiveCards.length > 0 || game.underperformingCards.length > 0 ? (
        <Section title="Notes & cards" aria-label="Notes and cards">
          {game.learnings ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Learnings</span>
              <p className="whitespace-pre-wrap text-sm">{game.learnings}</p>
            </div>
          ) : null}

          {game.impressiveCards.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Impressive cards</span>
              <ul className="flex flex-col gap-1 text-sm">
                {game.impressiveCards.map((entry) => (
                  <li key={entry.card.id} className="flex justify-between gap-2">
                    <span>{entry.card.name}</span>
                    <span className="text-muted-foreground">
                      {GAME_LOG_CARD_SIDE_LABELS[entry.side]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {game.underperformingCards.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Underperforming cards</span>
              <ul className="flex flex-col gap-1 text-sm">
                {game.underperformingCards.map((entry) => (
                  <li key={entry.card.id} className="flex justify-between gap-2">
                    <span>{entry.card.name}</span>
                    <span className="text-muted-foreground">
                      {GAME_LOG_CARD_SIDE_LABELS[entry.side]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section aria-label="Discussion" bodyClassName="gap-4">
        <CommentThread teamId={teamId} subjectType="game_log" subjectId={game.id} canComment />
        <ActivityFeed
          teamId={teamId}
          filters={{ subjectType: "game_log", subjectId: game.id }}
          title="Game activity"
        />
      </Section>
    </div>
  );
}
