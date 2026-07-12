import type { CardTestSuggestion } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";

import { SuggestionCard } from "./SuggestionCard";
import { SuggestionForm } from "./SuggestionForm";
import { SUGGESTION_STATUS_LABELS, SUGGESTION_STATUS_ORDER } from "./testing-queue-display";
import { useCardTestSuggestions } from "./use-card-test-suggestions";

/**
 * The per-deck card-test suggestion board: the deck's suggestions grouped by status,
 * each with voting and (for the author/admin) the status control. Any member may
 * propose a new test unless the deck is archived (existing suggestions are retained;
 * new ones are blocked — matching the server rule).
 */
export function SuggestionBoard({
  teamId,
  deckId,
  deckArchived,
}: {
  teamId: string | undefined;
  deckId: string;
  deckArchived: boolean;
}) {
  const { data, isPending } = useCardTestSuggestions(teamId, { deckId });
  const { data: user } = useCurrentUser();
  const { activeTeam } = useActiveTeam();
  const [proposing, setProposing] = useState(false);

  const suggestions = data?.data ?? [];
  const isTeamAdmin = activeTeam?.role === "team_admin";
  const canModify = (suggestion: CardTestSuggestion) =>
    suggestion.author.userId === user?.id || isTeamAdmin;

  return (
    <section className="flex flex-col gap-3" aria-label="Card-test suggestions">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Card-test suggestions</h3>
        {!deckArchived && !proposing ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setProposing(true)}>
            Propose a card test
          </Button>
        ) : null}
      </div>

      {proposing ? (
        <SuggestionForm teamId={teamId} deckId={deckId} onDone={() => setProposing(false)} />
      ) : null}

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading suggestions…</p>
      ) : suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No suggestions yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {SUGGESTION_STATUS_ORDER.map((status) => {
            const inStatus = suggestions.filter((suggestion) => suggestion.status === status);
            if (inStatus.length === 0) return null;
            return (
              <div key={status} className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {SUGGESTION_STATUS_LABELS[status]} ({inStatus.length})
                </h4>
                {inStatus.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.id}
                    teamId={teamId}
                    suggestion={suggestion}
                    canModify={canModify(suggestion)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
