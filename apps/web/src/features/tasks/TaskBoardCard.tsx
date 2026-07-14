import type { Task } from "@teambrewer/shared";
import type { CSSProperties, ReactNode, Ref } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { VoteControl } from "./VoteControl";

/**
 * A compact task card for the board columns: a drag handle, the title (opens the detail
 * dialog on click), a one-tap upvote, and a deck/assignee/report meta line. Presentational
 * — the drag wiring is supplied by the caller: `dragHandle` carries the dnd-kit listeners,
 * `containerRef`/`style`/`dragging` position it while dragging. The same component renders
 * the drag overlay (with a static handle).
 */
export function TaskBoardCard({
  teamId,
  task,
  onOpen,
  dragHandle,
  containerRef,
  style,
  dragging = false,
}: {
  teamId: string | undefined;
  task: Task;
  onOpen: () => void;
  dragHandle: ReactNode;
  containerRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  dragging?: boolean;
}) {
  return (
    <div
      ref={containerRef}
      style={style}
      className={cn(
        "rounded-lg border border-border bg-card p-2.5 shadow-sm transition-colors",
        dragging ? "opacity-40" : "hover:border-primary/50 hover:shadow-md",
      )}
    >
      <div className="flex items-start gap-1.5">
        {dragHandle}
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Open task: ${task.title}`}
          className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="line-clamp-2 text-sm font-medium leading-snug">{task.title}</p>
        </button>
        <VoteControl teamId={teamId} task={task} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6 text-xs text-muted-foreground">
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
  );
}
