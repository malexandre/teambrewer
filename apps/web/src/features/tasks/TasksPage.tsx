import type { Task } from "@teambrewer/shared";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";

import { TaskBoardCard } from "./TaskBoardCard";
import { TaskCard } from "./TaskCard";
import { TASK_STATUS_LABELS, TASK_STATUS_ORDER, TASK_STATUS_TONE } from "./task-display";
import { TaskForm } from "./TaskForm";
import { type TaskFilters, useTasks } from "./use-tasks";

type Scope = "all" | "mine";

/**
 * The Tasks board (meta-pivot redesign; replaces the old Assignments page): the
 * team's tasks grouped by status, with a scope toggle to narrow to the ones assigned
 * to you, one-tap upvoting, self-assign, the status control (with the report prompt
 * on finish), and per-task discussion. Any member may create a task.
 */
export function TasksPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const { data: user } = useCurrentUser();
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const filters: TaskFilters = scope === "mine" && user ? { assigneeId: user.id } : {};
  const { data, isPending } = useTasks(teamId, filters);
  const tasks = data?.data ?? [];

  const isTeamAdmin = activeTeam?.role === "team_admin";
  const canModify = (task: Task) =>
    task.author.userId === user?.id || task.assignee?.userId === user?.id || isTeamAdmin;

  // Look the selected task up by id each render so it tracks list refetches (and vanishes
  // — closing the dialog — when it's archived out of the list).
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tasks"
        actions={
          <Button size="sm" onClick={() => setCreating((open) => !open)}>
            {creating ? "Close" : "New task"}
          </Button>
        }
      />

      {creating ? (
        <Section title="New task">
          <TaskForm teamId={teamId} onDone={() => setCreating(false)} />
        </Section>
      ) : null}

      <div className="flex gap-2" role="group" aria-label="Task scope">
        <Button
          type="button"
          size="sm"
          variant={scope === "all" ? "default" : "outline"}
          onClick={() => setScope("all")}
        >
          All
        </Button>
        <Button
          type="button"
          size="sm"
          variant={scope === "mine" ? "default" : "outline"}
          onClick={() => setScope("mine")}
        >
          Assigned to me
        </Button>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <EmptyState message="No tasks yet." />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {TASK_STATUS_ORDER.map((status) => {
            const inStatus = tasks.filter((task) => task.status === status);
            return (
              <div
                key={status}
                className="flex w-72 shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2"
              >
                <div className="flex items-center justify-between px-1 py-0.5">
                  <Badge tone={TASK_STATUS_TONE[status]} size="sm" dot>
                    {TASK_STATUS_LABELS[status]}
                  </Badge>
                  <span className="text-xs font-medium text-muted-foreground">
                    {inStatus.length}
                  </span>
                </div>
                {inStatus.length === 0 ? (
                  <p className="px-1 pb-1 text-xs text-muted-foreground">Nothing here.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {inStatus.map((task) => (
                      <TaskBoardCard
                        key={task.id}
                        teamId={teamId}
                        task={task}
                        onOpen={() => setSelectedTaskId(task.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={Boolean(selectedTask)}
        onClose={() => setSelectedTaskId(null)}
        title={selectedTask?.title ?? "Task"}
        className="max-w-xl"
      >
        {selectedTask ? (
          <TaskCard
            teamId={teamId}
            task={selectedTask}
            viewerUserId={user?.id}
            canModify={canModify(selectedTask)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
