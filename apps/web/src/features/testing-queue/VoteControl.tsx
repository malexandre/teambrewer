import type { CardTestSuggestion } from "@teambrewer/shared";

import { cn } from "@/lib/utils";

import { useToggleVote } from "./use-suggestion-mutations";

/**
 * A single-tap upvote toggle (upvote-only): shows the tally and whether the viewer
 * has upvoted, and flips their vote on click. Retracting removes the row server-side.
 */
export function VoteControl({
  teamId,
  suggestion,
}: {
  teamId: string | undefined;
  suggestion: CardTestSuggestion;
}) {
  const toggleVote = useToggleVote(teamId, suggestion.id);
  return (
    <button
      type="button"
      aria-pressed={suggestion.viewerHasVoted}
      aria-label={suggestion.viewerHasVoted ? "Retract upvote" : "Upvote"}
      disabled={toggleVote.isPending}
      onClick={() => toggleVote.mutate(suggestion.viewerHasVoted)}
      className={cn(
        "flex flex-col items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
        suggestion.viewerHasVoted
          ? "border-primary bg-primary/10 text-primary"
          : "border-input hover:bg-accent",
      )}
    >
      <span aria-hidden>▲</span>
      <span>{suggestion.voteCount}</span>
    </button>
  );
}
