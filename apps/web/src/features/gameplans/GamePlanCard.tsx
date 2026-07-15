import type { MatchupGamePlan, MetaDeckEntry } from "@teambrewer/shared";
import { ChevronDown, ChevronRight, Pin } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { CardRichText } from "@/features/cards/CardRichText";
import { CommentThread } from "@/features/collaboration/CommentThread";
import { useComments } from "@/features/collaboration/use-comments";
import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";
import { formatRelativeTime } from "@/lib/format-relative-time";

import { GamePlanEditor } from "./GamePlanEditor";
import { useArchiveGamePlan } from "./use-game-plan-mutations";

// A plan longer than this (or spanning several lines) is clamped to a compact "pinned"
// note so the discussion — the point of the card — stays the focus.
const PLAN_CLAMP_CHARACTER_LIMIT = 240;
const PLAN_CLAMP_LINE_LIMIT = 3;

/**
 * A single matchup game-plan as a discussion-first card: the plan's name header with a
 * live count + last-activity, the plan itself demoted to a compact pinned note (its body
 * rendered with inline `+[[cardId]]` card chips via {@link CardRichText}), and the
 * always-visible discussion thread as the body. Any member may edit in place (name, body,
 * and covered decks); only a team-admin may archive (server-enforced), so Archive shows for
 * admins. Meta-entry coverage is edited via the editor's multi-select, so it is
 * intentionally not shown here.
 */
export function GamePlanCard({
  teamId,
  deckId,
  formatId,
  gamePlan,
  metaName,
  metaDeckEntries,
}: {
  teamId: string | undefined;
  deckId: string;
  formatId: string;
  gamePlan: MatchupGamePlan;
  /** The current meta's name (passed through to the editor), or null when none is current. */
  metaName: string | null;
  /** The current meta's tiered deck entries, offered as assignment targets in the editor. */
  metaDeckEntries: MetaDeckEntry[];
}) {
  const { activeTeam } = useActiveTeam();
  const isTeamAdmin = activeTeam?.role === "team_admin";
  const [editing, setEditing] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showFullPlan, setShowFullPlan] = useState(false);
  const archive = useArchiveGamePlan(teamId, gamePlan.id);

  // Shares the query key with the CommentThread below, so this derives the summary from
  // the same (deduped) fetch rather than a second request.
  const { data: commentData } = useComments(teamId, "matchup_game_plan", gamePlan.id);
  const { commentCount, lastActivityLabel } = useMemo(() => {
    const activeComments = (commentData?.data ?? [])
      .flatMap((comment) => [comment, ...comment.replies])
      .filter((comment) => comment.archivedAt === null);
    if (activeComments.length === 0) {
      return { commentCount: 0, lastActivityLabel: null as string | null };
    }
    const latestCreatedAt = activeComments
      .map((comment) => comment.createdAt)
      .reduce((latest, createdAt) => (createdAt > latest ? createdAt : latest));
    return {
      commentCount: activeComments.length,
      lastActivityLabel: formatRelativeTime(latestCreatedAt),
    };
  }, [commentData]);

  const activitySummary =
    commentCount > 0
      ? `${commentCount} ${commentCount === 1 ? "comment" : "comments"}${lastActivityLabel ? ` · last reply ${lastActivityLabel}` : ""}`
      : "No discussion yet";

  const planIsLong =
    gamePlan.body.length > PLAN_CLAMP_CHARACTER_LIMIT ||
    gamePlan.body.split("\n").length > PLAN_CLAMP_LINE_LIMIT;

  if (editing) {
    return (
      <GamePlanEditor
        teamId={teamId}
        deckId={deckId}
        formatId={formatId}
        existing={gamePlan}
        metaName={metaName}
        metaDeckEntries={metaDeckEntries}
        onDone={() => setEditing(false)}
      />
    );
  }

  const bodyId = `game-plan-body-${gamePlan.id}`;

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card">
      <div
        className={`flex items-center gap-2 bg-accent px-3 py-2${collapsed ? "" : " border-b border-primary/15"}`}
      >
        <h4 className="min-w-0 flex-1">
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={() => setCollapsed((open) => !open)}
          >
            {collapsed ? (
              <ChevronRight className="size-4 shrink-0 text-accent-foreground" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4 shrink-0 text-accent-foreground" aria-hidden="true" />
            )}
            <span className="truncate text-sm font-semibold text-accent-foreground">
              {gamePlan.name}
            </span>
          </button>
        </h4>
        <span className="shrink-0 text-xs text-accent-foreground/80">{activitySummary}</span>
        <span className="flex shrink-0 items-center gap-1">
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

      {collapsed ? null : (
        <div id={bodyId} className="flex flex-col gap-3 p-4">
          <div className="rounded-md border border-primary/15 bg-accent/50 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-accent-foreground">
              <Pin className="size-3.5" aria-hidden="true" />
              Plan
            </div>
            <CardRichText
              teamId={teamId}
              body={gamePlan.body}
              className={`whitespace-pre-wrap text-sm${planIsLong && !showFullPlan ? " line-clamp-3" : ""}`}
            />
            {planIsLong ? (
              <button
                type="button"
                className="mt-1 text-xs text-muted-foreground hover:underline"
                aria-expanded={showFullPlan}
                onClick={() => setShowFullPlan((open) => !open)}
              >
                {showFullPlan ? "Show less" : "Show more"}
              </button>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              Updated by {gamePlan.updatedBy.displayName}
            </p>
          </div>

          {archive.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {archive.error instanceof ApiError
                ? archive.error.message
                : "Could not archive the plan."}
            </p>
          ) : null}

          <CommentThread
            teamId={teamId}
            subjectType="matchup_game_plan"
            subjectId={gamePlan.id}
            canComment
            previewCount={3}
          />
        </div>
      )}
    </article>
  );
}
