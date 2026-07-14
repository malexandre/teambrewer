import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Task, TaskStatus } from "@teambrewer/shared";
import { GripVertical } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";
import { cn } from "@/lib/utils";

import { TaskBoardCard } from "./TaskBoardCard";
import { TaskCard } from "./TaskCard";
import { TASK_STATUS_LABELS, TASK_STATUS_ORDER, TASK_STATUS_TONE } from "./task-display";
import { TaskForm } from "./TaskForm";
import { useMoveTask } from "./use-task-mutations";
import { type TaskFilters, useTasks } from "./use-tasks";

type Scope = "all" | "mine";

/** A board card wired to dnd-kit: the handle is the drag activator (pointer + keyboard). */
function DraggableTaskCard({
  teamId,
  task,
  onOpen,
}: {
  teamId: string | undefined;
  task: Task;
  onOpen: () => void;
}) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({
    id: task.id,
  });
  return (
    <TaskBoardCard
      teamId={teamId}
      task={task}
      onOpen={onOpen}
      containerRef={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) ?? "" }}
      dragging={isDragging}
      dragHandle={
        <button
          type="button"
          aria-label={`Drag ${task.title}`}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
      }
    />
  );
}

/** A droppable status lane holding its tasks; highlights while a card hovers over it. */
function TaskColumn({
  status,
  tasks,
  teamId,
  onOpenTask,
}: {
  status: TaskStatus;
  tasks: Task[];
  teamId: string | undefined;
  onOpenTask: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      data-column={status}
      className={cn(
        // w-64 lanes: four + gaps (1060px) fit the ~1152px content width without scrolling
        // (w-72 would be 1188px and bring the scrollbar back).
        "flex w-64 shrink-0 flex-col gap-2 rounded-lg border p-2 transition-colors",
        isOver ? "border-primary bg-accent/40" : "border-border bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between px-1 py-0.5">
        <Badge tone={TASK_STATUS_TONE[status]} size="sm" dot>
          {TASK_STATUS_LABELS[status]}
        </Badge>
        <span className="text-xs font-medium text-muted-foreground">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <p className="px-1 pb-1 text-xs text-muted-foreground">Drop a task here.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <DraggableTaskCard
              key={task.id}
              teamId={teamId}
              task={task}
              onOpen={() => onOpenTask(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A static (non-interactive) drag handle for the drag overlay. */
const OVERLAY_HANDLE = (
  <span className="mt-0.5 shrink-0 text-muted-foreground">
    <GripVertical className="size-4" aria-hidden="true" />
  </span>
);

/**
 * The Tasks kanban board: a lane per status (Proposed → Assigned → Finished → Abandoned)
 * with compact cards. Cards drag freely between any lanes (pointer + keyboard via dnd-kit);
 * dropping into Finished demands a report first (the report-on-finish rule). Clicking a
 * card opens its detail dialog with the full controls. A scope toggle narrows to the
 * viewer's tasks; any member may create a task.
 */
export function TasksPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const { data: user } = useCurrentUser();
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // A task pending a report before it can be dropped into Finished (see report-on-finish).
  const [finishTask, setFinishTask] = useState<Task | null>(null);
  const [finishReport, setFinishReport] = useState("");

  const filters: TaskFilters = scope === "mine" && user ? { assigneeId: user.id } : {};
  const { data, isPending } = useTasks(teamId, filters);
  const tasks = data?.data ?? [];
  const moveTask = useMoveTask(teamId);

  const isTeamAdmin = activeTeam?.role === "team_admin";
  const canModify = (task: Task) =>
    task.author.userId === user?.id || task.assignee?.userId === user?.id || isTeamAdmin;

  // Look tasks up by id each render so they track list refetches (the detail dialog closes
  // when its task is archived; the drag overlay resolves the active card).
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const activeTask = tasks.find((task) => task.id === activeId) ?? null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const target = String(over.id) as TaskStatus;
    const task = tasks.find((candidate) => candidate.id === String(active.id));
    if (!task || task.status === target) return;
    // Finishing needs a report; if the task has none yet, prompt before moving.
    if (target === "finished" && task.report.trim().length === 0) {
      setFinishReport("");
      setFinishTask(task);
      return;
    }
    moveTask.mutate({ taskId: task.id, status: target });
  }

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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
          onDragEnd={handleDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex gap-3 overflow-x-auto pb-2">
            {TASK_STATUS_ORDER.map((status) => (
              <TaskColumn
                key={status}
                status={status}
                teamId={teamId}
                tasks={tasks.filter((task) => task.status === status)}
                onOpenTask={setSelectedTaskId}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask ? (
              <TaskBoardCard
                teamId={teamId}
                task={activeTask}
                onOpen={() => undefined}
                dragHandle={OVERLAY_HANDLE}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Task detail. */}
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

      {/* Report prompt when dropping a task into Finished. */}
      <Dialog
        open={Boolean(finishTask)}
        onClose={() => setFinishTask(null)}
        title="Finish task"
        className="max-w-md"
      >
        {finishTask ? (
          <div className="flex flex-col gap-3">
            <label htmlFor="finish-report" className="text-sm text-muted-foreground">
              What did you find? A report is required to finish “{finishTask.title}”.
            </label>
            <textarea
              id="finish-report"
              className="min-h-24 rounded-md border border-input bg-background p-2 text-sm"
              value={finishReport}
              onChange={(event) => setFinishReport(event.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={finishReport.trim().length === 0 || moveTask.isPending}
                onClick={() =>
                  moveTask.mutate(
                    { taskId: finishTask.id, status: "finished", report: finishReport.trim() },
                    { onSuccess: () => setFinishTask(null) },
                  )
                }
              >
                Finish task
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setFinishTask(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
