import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { TASK_STATUS_LABELS } from "@/features/tasks/task-display";
import { TaskForm } from "@/features/tasks/TaskForm";
import { useTasks } from "@/features/tasks/use-tasks";

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
            <li
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
            >
              <span className="font-medium">{task.title}</span>
              <span className="text-xs text-muted-foreground">
                {TASK_STATUS_LABELS[task.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
