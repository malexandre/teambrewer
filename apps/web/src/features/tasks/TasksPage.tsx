import type { Task } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";

import { TaskCard } from "./TaskCard";
import { TASK_STATUS_LABELS, TASK_STATUS_ORDER } from "./task-display";
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

  const filters: TaskFilters = scope === "mine" && user ? { assigneeId: user.id } : {};
  const { data, isPending } = useTasks(teamId, filters);
  const tasks = data?.data ?? [];

  const isTeamAdmin = activeTeam?.role === "team_admin";
  const canModify = (task: Task) =>
    task.author.userId === user?.id || task.assignee?.userId === user?.id || isTeamAdmin;

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
        TASK_STATUS_ORDER.map((status) => {
          const inStatus = tasks.filter((task) => task.status === status);
          if (inStatus.length === 0) return null;
          return (
            <Section
              key={status}
              title={`${TASK_STATUS_LABELS[status]} (${inStatus.length})`}
              bodyClassName="gap-3"
            >
              {inStatus.map((task) => (
                <TaskCard
                  key={task.id}
                  teamId={teamId}
                  task={task}
                  viewerUserId={user?.id}
                  canModify={canModify(task)}
                />
              ))}
            </Section>
          );
        })
      )}
    </div>
  );
}
