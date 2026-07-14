import type { Task, TaskStatus } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CardRichText } from "@/features/cards/CardRichText";
import { ActivityFeed } from "@/features/collaboration/ActivityFeed";
import { CommentThread } from "@/features/collaboration/CommentThread";

import { TaskForm } from "./TaskForm";
import { TaskStatusControl } from "./TaskStatusControl";
import { useArchiveTask, useUpdateTask } from "./use-task-mutations";
import { VoteControl } from "./VoteControl";

/**
 * A task's detail body, shown inside the board's detail dialog (the dialog supplies the
 * title + close): the `+card`-rich description (tokens resolved to card chips), the
 * author/assignee, and the upvote control. Any member may self-assign a still-open task;
 * the author, the assignee, or a team-admin gets the status control (with the required
 * report on finish), inline edit, and archive. A finished task's report is revealed
 * behind a Report toggle; discussion loads on demand.
 */
export function TaskCard({
  teamId,
  task,
  viewerUserId,
  canModify,
}: {
  teamId: string | undefined;
  task: Task;
  viewerUserId: string | undefined;
  canModify: boolean;
}) {
  const updateTask = useUpdateTask(teamId, task.id);
  const archiveTask = useArchiveTask(teamId, task.id);
  const [editing, setEditing] = useState(false);
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const isTerminal = task.status === "finished" || task.status === "abandoned";
  const canSelfAssign =
    Boolean(viewerUserId) && task.assignee?.userId !== viewerUserId && !isTerminal;

  function changeStatus(next: TaskStatus, report?: string) {
    updateTask.mutate({ status: next, ...(report ? { report } : {}) });
  }

  if (editing) {
    return <TaskForm teamId={teamId} task={task} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        {task.description ? (
          <CardRichText
            teamId={teamId}
            body={task.description}
            className="min-w-0 whitespace-pre-wrap text-sm text-muted-foreground"
          />
        ) : (
          <span className="text-sm text-muted-foreground">No description.</span>
        )}
        <VoteControl teamId={teamId} task={task} />
      </div>

      <p className="text-xs text-muted-foreground">
        By {task.author.displayName}
        {task.assignee ? ` · Assigned to ${task.assignee.displayName}` : " · Unassigned"}
        {task.deckName ? ` · ${task.deckName}` : ""}
      </p>

      {task.report ? (
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="self-start"
            aria-expanded={showReport}
            onClick={() => setShowReport((open) => !open)}
          >
            {showReport ? "Hide report" : "Report"}
          </Button>
          {showReport ? (
            <p className="rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">{task.report}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {canSelfAssign ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={updateTask.isPending}
            onClick={() => {
              if (viewerUserId) updateTask.mutate({ assigneeId: viewerUserId });
            }}
          >
            Assign to me
          </Button>
        ) : null}
      </div>

      {canModify ? (
        <div className="flex flex-col gap-2 border-t border-input pt-2">
          <TaskStatusControl
            status={task.status}
            onChange={changeStatus}
            disabled={updateTask.isPending}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="self-start text-destructive"
              disabled={archiveTask.isPending}
              onClick={() => archiveTask.mutate()}
            >
              Archive
            </Button>
          </div>
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
          <CommentThread teamId={teamId} subjectType="task" subjectId={task.id} canComment />
          <ActivityFeed
            teamId={teamId}
            filters={{ subjectType: "task", subjectId: task.id }}
            title="Task activity"
          />
        </div>
      ) : null}
    </div>
  );
}
