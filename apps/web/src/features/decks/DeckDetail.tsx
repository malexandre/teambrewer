import { useNavigate } from "@tanstack/react-router";
import type { DeckDetail as DeckDetailType } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useFormats } from "@/features/cards/use-formats";
import { useHeroes } from "@/features/cards/use-heroes";
import { useIdentityLabel } from "@/features/game-logging/use-game-config";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";

import { ActivityFeed } from "@/features/collaboration/ActivityFeed";
import { CommentThread } from "@/features/collaboration/CommentThread";

import { GamePlanSection } from "@/features/gameplans/GamePlanSection";

import { DeckCardIdeasSection } from "./DeckCardIdeasSection";
import { DeckReadinessSection } from "./DeckReadinessSection";
import { DECK_VISIBILITY_LABELS } from "./deck-display";
import { DeckForm } from "./DeckForm";
import { DeckStatusControl } from "./DeckStatusControl";
import { IterationLog } from "./IterationLog";
import { useArchiveDeck, useChangeDeckStatus } from "./use-deck-mutations";

/**
 * A deck's detail: a prominent link out to the external list (decks are links —
 * ADR-0002, no card-list UI), its metadata, the status control (owner/admin
 * only), and the iteration log. Editing swaps in the deck form in place.
 */
export function DeckDetail({ teamId, deck }: { teamId: string | undefined; deck: DeckDetailType }) {
  const { data: user } = useCurrentUser();
  const { activeTeam } = useActiveTeam();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const changeStatus = useChangeDeckStatus(teamId, deck.id);
  const archiveDeck = useArchiveDeck(teamId, deck.id);
  const { data: formatData } = useFormats(teamId);
  const { data: heroData } = useHeroes(teamId);
  const identityLabel = useIdentityLabel(teamId);

  const formatName = formatData?.data.find((format) => format.id === deck.formatId)?.name;
  const heroName = deck.heroId
    ? heroData?.data.find((hero) => hero.id === deck.heroId)?.name
    : null;
  const canModify = deck.ownerId === user?.id || activeTeam?.role === "team_admin";

  if (editing) {
    return (
      <DeckForm
        teamId={teamId}
        deck={deck}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  function archive() {
    if (!window.confirm("Archive this deck? It will be hidden but its history is kept.")) return;
    archiveDeck.mutate(undefined, { onSuccess: () => void navigate({ to: "/decks" }) });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{deck.name}</h2>
        {canModify ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={archive} disabled={archiveDeck.isPending}>
              Archive
            </Button>
          </div>
        ) : null}
      </div>

      <a
        href={deck.externalUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex w-fit items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Open deck list ↗
      </a>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Format</dt>
          <dd>{formatName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{identityLabel}</dt>
          <dd>{heroName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Source</dt>
          <dd>{deck.source}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Visibility</dt>
          <dd>{DECK_VISIBILITY_LABELS[deck.visibility]}</dd>
        </div>
        {deck.tags.length > 0 ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Tags</dt>
            <dd className="flex flex-wrap gap-1">
              {deck.tags.map((tag) => (
                <span key={tag} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                  {tag}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        {deck.linkedMetas.length > 0 ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Metas</dt>
            <dd className="flex flex-wrap gap-1">
              {deck.linkedMetas.map((meta) => (
                <span key={meta.id} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                  {meta.name}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Status</span>
        <DeckStatusControl
          status={deck.status}
          disabled={!canModify || changeStatus.isPending}
          onChange={(next) => changeStatus.mutate(next)}
        />
        {changeStatus.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {changeStatus.error instanceof ApiError
              ? changeStatus.error.message
              : "Could not change status."}
          </p>
        ) : null}
      </div>

      {deck.notes ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Notes</h3>
          <p className="whitespace-pre-wrap text-sm">{deck.notes}</p>
        </section>
      ) : null}

      <DeckReadinessSection teamId={teamId} deckId={deck.id} />

      <IterationLog teamId={teamId} deckId={deck.id} canAddEntry={canModify} />

      <GamePlanSection
        teamId={teamId}
        deckId={deck.id}
        formatId={deck.formatId}
        deckArchived={deck.archivedAt !== null}
      />

      <DeckCardIdeasSection teamId={teamId} deckId={deck.id} deckName={deck.name} />

      <CommentThread teamId={teamId} subjectType="deck" subjectId={deck.id} canComment />

      <ActivityFeed
        teamId={teamId}
        filters={{ subjectType: "deck", subjectId: deck.id }}
        title="Deck activity"
      />
    </div>
  );
}
