import type { MatchupGamePlan } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CardPreview } from "@/features/cards/CardPreview";
import { CommentThread } from "@/features/collaboration/CommentThread";
import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";

import { GamePlanEditor } from "./GamePlanEditor";
import { useArchiveGamePlan } from "./use-game-plan-mutations";

/**
 * A single matchup game-plan: the "our deck vs opponent" header, the pre-wrapped plan
 * body, a key-cards strip with hover/press card previews, and an on-demand discussion
 * thread. Any member may edit in place (matchup key immutable); only a team-admin may
 * archive (server-enforced), so the Archive control shows for admins only.
 */
export function GamePlanCard({
  teamId,
  deckId,
  formatId,
  gamePlan,
}: {
  teamId: string | undefined;
  deckId: string;
  formatId: string;
  gamePlan: MatchupGamePlan;
}) {
  const { activeTeam } = useActiveTeam();
  const isTeamAdmin = activeTeam?.role === "team_admin";
  const [editing, setEditing] = useState(false);
  const [showDiscussion, setShowDiscussion] = useState(false);
  const archive = useArchiveGamePlan(teamId, gamePlan.id);

  if (editing) {
    return (
      <GamePlanEditor
        teamId={teamId}
        deckId={deckId}
        formatId={formatId}
        existing={gamePlan}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <article className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold">vs {gamePlan.opponentSnapshotLabel}</h4>
        <span className="flex items-center gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {isTeamAdmin ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={archive.isPending}
              onClick={() => archive.mutate()}
            >
              Archive
            </Button>
          ) : null}
        </span>
      </div>

      <p className="whitespace-pre-wrap text-sm">{gamePlan.body}</p>

      {gamePlan.keyCards.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Key cards
          </span>
          <ul className="flex flex-wrap gap-2">
            {gamePlan.keyCards.map((card) => (
              <li key={card.id} className="text-sm">
                <CardPreview card={card} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">Updated by {gamePlan.updatedBy.displayName}</p>

      {archive.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {archive.error instanceof ApiError
            ? archive.error.message
            : "Could not archive the plan."}
        </p>
      ) : null}

      <div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-expanded={showDiscussion}
          onClick={() => setShowDiscussion((open) => !open)}
        >
          {showDiscussion ? "Hide discussion" : "Discussion"}
        </Button>
      </div>
      {showDiscussion ? (
        <CommentThread
          teamId={teamId}
          subjectType="matchup_game_plan"
          subjectId={gamePlan.id}
          canComment
        />
      ) : null}
    </article>
  );
}
