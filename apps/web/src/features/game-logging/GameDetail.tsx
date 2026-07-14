import { useNavigate } from "@tanstack/react-router";
import type { GameLogDetail as GameLogDetailType } from "@teambrewer/shared";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useHeroes } from "@/features/cards/use-heroes";
import { ActivityFeed } from "@/features/collaboration/ActivityFeed";
import { CommentThread } from "@/features/collaboration/CommentThread";
import { useDecks } from "@/features/decks/use-decks";
import { useMembers } from "@/features/teams/use-members";
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
import { GameLogWizard } from "./GameLogWizard";
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
 * team-admin may edit (swaps in the form in place) or archive.
 */
export function GameDetail({
  teamId,
  game,
}: {
  teamId: string | undefined;
  game: GameLogDetailType;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const archiveGame = useArchiveGame(teamId, game.id);

  const { data: decks } = useDecks(teamId, {});
  const { data: heroes } = useHeroes(teamId);
  const { data: members } = useMembers(teamId);

  const maps: GameLogLabelMaps = useMemo(
    () => ({
      decks: Object.fromEntries((decks?.data ?? []).map((d) => [d.id, d.name])),
      heroes: Object.fromEntries((heroes?.data ?? []).map((h) => [h.id, h.name])),
      members: Object.fromEntries((members?.data ?? []).map((m) => [m.userId, m.displayName])),
    }),
    [decks, heroes, members],
  );

  if (editing) {
    return (
      <GameLogWizard
        teamId={teamId}
        gameLog={game}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  function archive() {
    if (!window.confirm("Archive this game? It will be hidden but its history is kept.")) return;
    archiveGame.mutate(undefined, { onSuccess: () => void navigate({ to: "/games" }) });
  }

  const ourDeck = describeSelf(game.sideA, maps);
  const ourPilot = game.sideA.pilotUserId
    ? (maps.members[game.sideA.pilotUserId] ?? "A teammate")
    : "A teammate";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {ourDeck} vs {describeOpponent(game.sideB, maps)}
        </h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={archive} disabled={archiveGame.isPending}>
            Archive
          </Button>
        </div>
      </div>

      {archiveGame.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {archiveGame.error instanceof ApiError ? archiveGame.error.message : "Could not archive."}
        </p>
      ) : null}

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
          <dd>{game.firstPlayerSide === "A" ? ourPilot : describeOpponent(game.sideB, maps)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Played</dt>
          <dd>{formatPlayedAt(game.playedAt)}</dd>
        </div>
      </dl>

      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Confidence factors</h3>
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
      </section>

      {game.learnings ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Learnings</h3>
          <p className="whitespace-pre-wrap text-sm">{game.learnings}</p>
        </section>
      ) : null}

      {game.impressiveCards.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Impressive cards</h3>
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
        </section>
      ) : null}

      {game.underperformingCards.length > 0 ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Underperforming cards</h3>
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
        </section>
      ) : null}

      <CommentThread teamId={teamId} subjectType="game_log" subjectId={game.id} canComment />

      <ActivityFeed
        teamId={teamId}
        filters={{ subjectType: "game_log", subjectId: game.id }}
        title="Game activity"
      />
    </div>
  );
}
