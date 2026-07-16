import { useNavigate } from "@tanstack/react-router";
import type { DeckDetail as DeckDetailType } from "@teambrewer/shared";
import { Info } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Tabs, type TabDefinition } from "@/components/ui/tabs";
import { useFormats } from "@/features/cards/use-formats";
import { useHeroes } from "@/features/cards/use-heroes";
import { useIdentityLabel } from "@/features/game-logging/use-game-config";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";

import { ActivityFeed } from "@/features/collaboration/ActivityFeed";
import { CommentThread } from "@/features/collaboration/CommentThread";
import { useHighlightCommentId } from "@/features/collaboration/use-highlight-comment";

import { GamePlanSection } from "@/features/gameplans/GamePlanSection";

import { DeckCardIdeasSection } from "./DeckCardIdeasSection";
import { DeckNotesSection } from "./DeckNotesSection";
import { DeckCardObservationsSection } from "./DeckCardObservationsSection";
import { DeckReadinessSection } from "./DeckReadinessSection";
import { DECK_STATUS_LABELS, DECK_STATUS_TONE, DECK_VISIBILITY_LABELS } from "./deck-display";
import { DeckForm } from "./DeckForm";
import { DeckStatusControl } from "./DeckStatusControl";
import { IterationLog } from "./IterationLog";
import { useArchiveDeck, useChangeDeckStatus } from "./use-deck-mutations";

/** The deck section ids, matching the tab definitions and the `/decks/:deckId/:deckTab` path. */
const DECK_TAB_IDS = new Set(["general", "matchups", "plan", "cards", "card-ideas", "logs"]);

/**
 * A deck's detail. A persistent header keeps the deck's identity in view — its name,
 * the Edit/Archive controls, the prominent link out to the external list (decks are
 * links — ADR-0002, no card-list UI), and a compact format/hero/status summary. The
 * rest is organized into accessible tabs (General, Matchup Matrix, Plan, Card observations,
 * Tasks, Logs) so a long deck page stays navigable. Editing opens the deck form in
 * a modal; an archived deck is read-only.
 */
export function DeckDetail({
  teamId,
  deck,
  activeTabId: activeTabIdProp,
}: {
  teamId: string | undefined;
  deck: DeckDetailType;
  /** The tab from the URL path; unknown/absent falls back to General. */
  activeTabId?: string | undefined;
}) {
  const { data: user } = useCurrentUser();
  const { activeTeam } = useActiveTeam();
  const navigate = useNavigate();
  const highlightCommentId = useHighlightCommentId();
  const [isEditOpen, setIsEditOpen] = useState(false);

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
  const isArchived = deck.archivedAt !== null;

  // The active tab is URL-driven: read from the path, fall back to General for anything
  // unknown, and change it by navigating so each section is shareable and back-navigable.
  const activeTabId =
    activeTabIdProp && DECK_TAB_IDS.has(activeTabIdProp) ? activeTabIdProp : "general";
  function selectTab(tabId: string): void {
    if (tabId === "general") {
      void navigate({ to: "/decks/$deckId", params: { deckId: deck.id } });
    } else {
      void navigate({ to: "/decks/$deckId/$deckTab", params: { deckId: deck.id, deckTab: tabId } });
    }
  }

  function archive() {
    if (!window.confirm("Archive this deck? It will be hidden but its history is kept.")) return;
    archiveDeck.mutate(undefined, { onSuccess: () => void navigate({ to: "/decks" }) });
  }

  const generalTab = (
    <div className="flex flex-col gap-4">
      <Section title="Overview" icon={<Info />} aria-label="Overview">
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
                  <Badge key={tag} tone="neutral" size="sm">
                    {tag}
                  </Badge>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold">Linked metas</span>
          {deck.linkedMetas.length > 0 ? (
            <ul className="flex flex-wrap gap-1">
              {deck.linkedMetas.map((meta) => (
                <li key={meta.id}>
                  <Badge tone="neutral" size="sm">
                    {meta.name}
                    {meta.metaDeckEntryLabel ? (
                      <span className="font-normal opacity-80"> · ≈ {meta.metaDeckEntryLabel}</span>
                    ) : null}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Not linked to any meta.</p>
          )}
        </div>

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
      </Section>

      <DeckNotesSection teamId={teamId} deck={deck} canEdit={canModify && !isArchived} />

      {/* Discussion is central to the tool, so it lives on the deck's landing tab. */}
      <Section aria-label="Discussion">
        <CommentThread
          teamId={teamId}
          subjectType="deck"
          subjectId={deck.id}
          canComment
          highlightCommentId={highlightCommentId}
        />
      </Section>
    </div>
  );

  const tabs: TabDefinition[] = [
    { id: "general", label: "General", panel: generalTab },
    {
      id: "matchups",
      label: "Matchup Matrix",
      panel: <DeckReadinessSection teamId={teamId} deckId={deck.id} />,
    },
    {
      id: "plan",
      label: "Plan",
      panel: (
        <GamePlanSection
          teamId={teamId}
          deckId={deck.id}
          formatId={deck.formatId}
          deckArchived={isArchived}
        />
      ),
    },
    {
      id: "cards",
      label: "Card observations",
      panel: <DeckCardObservationsSection teamId={teamId} deckId={deck.id} />,
    },
    {
      id: "card-ideas",
      label: "Tasks",
      panel: <DeckCardIdeasSection teamId={teamId} deckId={deck.id} deckName={deck.name} />,
    },
    {
      id: "logs",
      label: "Logs",
      panel: (
        <div className="flex flex-col gap-4">
          <IterationLog teamId={teamId} deckId={deck.id} canAddEntry={canModify} />
          <Section aria-label="Activity log">
            <ActivityFeed
              teamId={teamId}
              filters={{ subjectType: "deck", subjectId: deck.id }}
              title="Deck activity"
            />
          </Section>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={deck.name}
        description={
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatName ?? "—"}</span>
            {heroName ? (
              <>
                <span aria-hidden>·</span>
                <span>{heroName}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <Badge tone={DECK_STATUS_TONE[deck.status]} dot>
              {DECK_STATUS_LABELS[deck.status]}
            </Badge>
          </div>
        }
        actions={
          <>
            <a
              href={deck.externalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Open deck list ↗
            </a>
            {canModify ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setIsEditOpen(true)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={archive}
                  disabled={archiveDeck.isPending}
                >
                  Archive
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <Tabs
        ariaLabel="Deck sections"
        tabs={tabs}
        activeTabId={activeTabId}
        onTabChange={selectTab}
      />

      <Dialog open={isEditOpen} onClose={() => setIsEditOpen(false)} title="Edit deck">
        <DeckForm
          teamId={teamId}
          deck={deck}
          onSaved={() => setIsEditOpen(false)}
          onCancel={() => setIsEditOpen(false)}
        />
      </Dialog>
    </div>
  );
}
