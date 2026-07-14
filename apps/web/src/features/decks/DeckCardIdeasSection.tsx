import type { Task } from "@teambrewer/shared";
import { Lightbulb } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { TASK_STATUS_LABELS, TASK_STATUS_TONE } from "@/features/tasks/task-display";
import { TaskForm } from "@/features/tasks/TaskForm";
import { useTasks } from "@/features/tasks/use-tasks";

/**
 * One task row in the deck's card-ideas list: title + status badge, with a finished
 * task's report revealed behind a Report toggle (mirroring the tasks board detail, so a
 * teammate sees the conclusion without leaving the deck). Own toggle state per row.
 */
function DeckTaskRow({ task }: { task: Task }) {
  const [showReport, setShowReport] = useState(false);
  const hasReport = task.report.trim().length > 0;

  return (
    <li className="flex flex-col gap-1 rounded-md border border-border p-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{task.title}</span>
        <div className="flex items-center gap-2">
          {hasReport ? (
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
          ) : null}
          <Badge tone={TASK_STATUS_TONE[task.status]} size="sm">
            {TASK_STATUS_LABELS[task.status]}
          </Badge>
        </div>
      </div>

      {hasReport && showReport ? (
        <p className="rounded-md bg-muted p-2 text-xs whitespace-pre-wrap">{task.report}</p>
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
      title="Card ideas & tasks"
      icon={<Lightbulb />}
      aria-label="Card ideas"
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
            <DeckTaskRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </Section>
  );
}
