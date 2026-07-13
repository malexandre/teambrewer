import type { Task } from "@teambrewer/shared";

import { cn } from "@/lib/utils";

import { useToggleTaskVote } from "./use-task-mutations";

/**
 * A single-tap upvote toggle (upvote-only): shows the tally and whether the viewer
 * has upvoted, and flips their vote on click. Retracting removes the row server-side.
 */
export function VoteControl({ teamId, task }: { teamId: string | undefined; task: Task }) {
  const toggleVote = useToggleTaskVote(teamId, task.id);
  return (
    <button
      type="button"
      aria-pressed={task.viewerHasVoted}
      aria-label={task.viewerHasVoted ? "Retract upvote" : "Upvote"}
      disabled={toggleVote.isPending}
      onClick={() => toggleVote.mutate(task.viewerHasVoted)}
      className={cn(
        "flex flex-col items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50",
        task.viewerHasVoted
          ? "border-primary bg-primary/10 text-primary"
          : "border-input hover:bg-accent",
      )}
    >
      <span aria-hidden>▲</span>
      <span>{task.voteCount}</span>
    </button>
  );
}
