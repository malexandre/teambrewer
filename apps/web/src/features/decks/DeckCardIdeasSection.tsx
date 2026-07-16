import type { Task } from "@teambrewer/shared";
import { Lightbulb } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { CommentThread } from "@/features/collaboration/CommentThread";
import { TASK_STATUS_LABELS, TASK_STATUS_TONE } from "@/features/tasks/task-display";
import { TaskForm } from "@/features/tasks/TaskForm";
import { useTasks } from "@/features/tasks/use-tasks";

/**
 * One task row in the deck's card-ideas list: title + status badge, with a finished
 * task's report revealed behind a Report toggle and the task's discussion (an
 * `@`/`+card` comment composer) behind a Discussion toggle — mirroring the tasks board
 * detail, so a teammate reads the conclusion and chimes in without leaving the deck.
 * Own toggle state per row.
 */
function DeckTaskRow({ teamId, task }: { teamId: string | undefined; task: Task }) {
  const [showReport, setShowReport] = useState(false);
  const [showDiscussion, setShowDiscussion] = useState(false);
  const hasReport = task.report.trim().length > 0;

  return (
    <li className="flex flex-col gap-1 rounded-md border border-border p-2 text-sm">
      {/* Stack on phones so the title keeps a full-width line (it would otherwise be
          squeezed to zero by the fixed-width action columns and clipped by `truncate`);
          side-by-side from `sm` up. */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <span className="min-w-0 flex-1 truncate font-medium" title={task.title}>
          {task.title}
        </span>
        {/* Fixed-width slots so Report / Discussion / status line up as columns across
            every row; `justify-end` keeps them flush right (aligning the status badges even
            on rows without a Report) once the group spans the row on the mobile stack. */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {hasReport ? (
            <span className="flex w-24 justify-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                aria-expanded={showReport}
                onClick={() => setShowReport((open) => !open)}
              >
                {showReport ? "Hide report" : "Report"}
              </Button>
            </span>
          ) : null}
          <span className="flex w-28 justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              aria-expanded={showDiscussion}
              onClick={() => setShowDiscussion((open) => !open)}
            >
              {showDiscussion ? "Hide discussion" : "Discussion"}
            </Button>
          </span>
          <span className="flex w-24 justify-end">
            <Badge tone={TASK_STATUS_TONE[task.status]} size="sm">
              {TASK_STATUS_LABELS[task.status]}
            </Badge>
          </span>
        </div>
      </div>

      {hasReport && showReport ? (
        <p className="rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">{task.report}</p>
      ) : null}

      {showDiscussion ? (
        <div className="border-t border-input pt-2">
          <CommentThread teamId={teamId} subjectType="task" subjectId={task.id} canComment />
        </div>
      ) : null}
    </li>
  );
}

/**
 * The deck-page **"Add card idea"** affordance (WS-4): opens the shared tasks
 * {@link TaskForm} pre-linked to this deck (deckId seeded), with a card-test title
 * scaffold and a `+card`-ready description — reusing the tasks feature's create path
 * (POST /api/tasks), not a parallel one. Also surfaces the deck's existing tasks as a
 * light list so ideas already in flight are visible on the deck.
 */
export function DeckCardIdeasSection({
  teamId,
  deckId,
  deckName,
}: {
  teamId: string | undefined;
  deckId: string;
  deckName: string;
}) {
  const [adding, setAdding] = useState(false);
  const { data, isPending } = useTasks(teamId, { deckId });
  const tasks = data?.data ?? [];

  return (
    <Section
      title="Tasks"
      icon={<Lightbulb />}
      aria-label="Tasks"
      bodyClassName="gap-2"
      actions={
        !adding ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            Add card idea
          </Button>
        ) : null
      }
    >
      {adding ? (
        <TaskForm
          teamId={teamId}
          initialDeckId={deckId}
          initialTitle={`Card idea: ${deckName}`}
          initialDescription="Card to try (type + to link it) and why it might help this deck's matchups."
          onDone={() => setAdding(false)}
        />
      ) : null}

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading tasks…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tasks for this deck yet. Add a card idea to start one.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {tasks.map((task) => (
            <DeckTaskRow key={task.id} teamId={teamId} task={task} />
          ))}
        </ul>
      )}
    </Section>
  );
}
