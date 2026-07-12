import type { CardTestSuggestion, CardTestSuggestionStatus } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ActivityFeed } from "@/features/collaboration/ActivityFeed";
import { CommentThread } from "@/features/collaboration/CommentThread";

import { SuggestionStatusControl } from "./SuggestionStatusControl";
import { cardSwapSummary } from "./testing-queue-display";
import { useArchiveSuggestion, useUpdateSuggestion } from "./use-suggestion-mutations";
import { VoteControl } from "./VoteControl";

/**
 * One card-test suggestion on the board: the swap (+card / −card), reasoning, author,
 * and its upvote control. The author or a team-admin additionally gets the status
 * control (with the required resolution note on adopt/reject) and an archive action.
 */
export function SuggestionCard({
  teamId,
  suggestion,
  canModify,
}: {
  teamId: string | undefined;
  suggestion: CardTestSuggestion;
  canModify: boolean;
}) {
  const updateSuggestion = useUpdateSuggestion(teamId, suggestion.id);
  const archiveSuggestion = useArchiveSuggestion(teamId, suggestion.id);
  const [showDiscussion, setShowDiscussion] = useState(false);

  function changeStatus(next: CardTestSuggestionStatus, resolutionNote?: string) {
    updateSuggestion.mutate({ status: next, ...(resolutionNote ? { resolutionNote } : {}) });
  }

  return (
    <article className="flex flex-col gap-2 rounded-md border border-input p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">
            {cardSwapSummary(suggestion.cardIn.name, suggestion.cardOut?.name ?? null)}
          </p>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {suggestion.reasoning}
          </p>
        </div>
        <VoteControl teamId={teamId} suggestion={suggestion} />
      </div>

      <p className="text-xs text-muted-foreground">Proposed by {suggestion.author.displayName}</p>

      {suggestion.resolutionNote ? (
        <p className="rounded-md bg-muted p-2 text-xs">
          <span className="font-medium">Resolution:</span> {suggestion.resolutionNote}
        </p>
      ) : null}

      {canModify ? (
        <div className="flex flex-col gap-2 border-t border-input pt-2">
          <SuggestionStatusControl
            status={suggestion.status}
            onChange={changeStatus}
            disabled={updateSuggestion.isPending}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start text-destructive"
            disabled={archiveSuggestion.isPending}
            onClick={() => archiveSuggestion.mutate()}
          >
            Archive
          </Button>
        </div>
      ) : null}

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="self-start"
        aria-expanded={showDiscussion}
        onClick={() => setShowDiscussion((open) => !open)}
      >
        {showDiscussion ? "Hide discussion" : "Discussion"}
      </Button>

      {showDiscussion ? (
        <div className="flex flex-col gap-4 border-t border-input pt-2">
          <CommentThread
            teamId={teamId}
            subjectType="card_test_suggestion"
            subjectId={suggestion.id}
            canComment
          />
          <ActivityFeed
            teamId={teamId}
            filters={{ subjectType: "card_test_suggestion", subjectId: suggestion.id }}
            title="Suggestion activity"
          />
        </div>
      ) : null}
    </article>
  );
}
