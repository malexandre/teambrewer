import type { Task } from "@teambrewer/shared";

import { Badge } from "@/components/ui/badge";

import { VoteControl } from "./VoteControl";

/**
 * A compact task card for the board columns: title, a one-tap upvote, and a meta line
 * (deck + assignee, plus a report marker). The whole card is a stretched button that
 * opens the task's detail dialog; the vote control sits above it and stops the click,
 * so upvoting from the board never opens the detail.
 */
export function TaskBoardCard({
  teamId,
  task,
  onOpen,
}: {
  teamId: string | undefined;
  task: Task;
  onOpen: () => void;
}) {
  return (
    <li className="relative rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/50 hover:shadow-md">
      <button
        type="button"
        aria-label={`Open task: ${task.title}`}
        onClick={onOpen}
        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="pointer-events-none relative flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 text-sm font-medium leading-snug">{task.title}</p>
          <div className="pointer-events-auto shrink-0">
            <VoteControl teamId={teamId} task={task} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {task.deckName ? (
            <Badge tone="neutral" size="sm">
              {task.deckName}
            </Badge>
          ) : null}
          <span>{task.assignee ? task.assignee.displayName : "Unassigned"}</span>
          {task.report ? (
            <span title="Has a report" aria-label="Has a report">
              📝
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
