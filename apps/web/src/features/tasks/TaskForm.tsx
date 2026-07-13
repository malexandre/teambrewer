import type { CreateTaskInput, Task, UpdateTaskInput } from "@teambrewer/shared";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { MentionComposer } from "@/features/collaboration/MentionComposer";
import { useDecks } from "@/features/decks/use-decks";
import { useMembers } from "@/features/teams/use-members";
import { ApiError } from "@/lib/api-client";

import { SELECT_CLASS } from "./task-display";
import { useCreateTask, useUpdateTask } from "./use-task-mutations";

/**
 * Create or edit a task: a title, an optional deck link, an optional assignee, and a
 * `+card`-enabled prose description (the WS-6 {@link MentionComposer} with card
 * mentions on — type `+` to link a card, `@` to mention a teammate). The composer's
 * submit is the form's submit; the description carries the substance of the task, so
 * both a title and a description are required. A `deckId` may be pre-seeded (e.g. an
 * "add card idea" affordance from a deck page — WS-4).
 */
export function TaskForm({
  teamId,
  task,
  initialDeckId,
  onDone,
}: {
  teamId: string | undefined;
  task?: Task;
  initialDeckId?: string;
  onDone: () => void;
}) {
  const isEdit = Boolean(task);
  const createTask = useCreateTask(teamId);
  const updateTask = useUpdateTask(teamId, task?.id ?? "");
  const { data: memberData } = useMembers(teamId);
  const { data: deckData } = useDecks(teamId);

  const members = memberData?.data ?? [];
  const decks = deckData?.data ?? [];

  const [title, setTitle] = useState(task?.title ?? "");
  const [deckId, setDeckId] = useState(task?.deckId ?? initialDeckId ?? "");
  const [assigneeId, setAssigneeId] = useState(task?.assignee?.userId ?? "");
  const [titleError, setTitleError] = useState(false);
  // The description lives in the composer (uncontrolled); we mirror the last
  // submitted value so a validation/API failure can re-seed a remounted composer
  // instead of silently dropping what the user typed.
  const [draftDescription, setDraftDescription] = useState(task?.description ?? "");
  const [composerKey, setComposerKey] = useState(0);

  const mutation = isEdit ? updateTask : createTask;

  function restoreComposer(description: string) {
    setDraftDescription(description);
    setComposerKey((key) => key + 1);
  }

  function handleSubmit(description: string) {
    if (title.trim().length === 0) {
      setTitleError(true);
      restoreComposer(description);
      return;
    }
    setTitleError(false);

    if (isEdit) {
      const input: UpdateTaskInput = {
        title: title.trim(),
        description,
        deckId: deckId ? deckId : null,
        assigneeId: assigneeId ? assigneeId : null,
      };
      updateTask.mutate(input, {
        onSuccess: onDone,
        onError: () => restoreComposer(description),
      });
      return;
    }

    const input: CreateTaskInput = {
      title: title.trim(),
      description,
      ...(deckId ? { deckId } : {}),
      ...(assigneeId ? { assigneeId } : {}),
    };
    createTask.mutate(input, {
      onSuccess: onDone,
      onError: () => restoreComposer(description),
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-input p-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Title</span>
        <Input
          aria-label="Task title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Test Bravado over Sink Below"
        />
      </label>
      {titleError ? (
        <p className="text-sm text-destructive" role="alert">
          A task title is required.
        </p>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Deck (optional)</span>
        <select
          className={SELECT_CLASS}
          aria-label="Deck"
          value={deckId}
          onChange={(event) => setDeckId(event.target.value)}
        >
          <option value="">— No deck —</option>
          {decks.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Assignee (optional)</span>
        <select
          className={SELECT_CLASS}
          aria-label="Assignee"
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
        >
          <option value="">— Unassigned —</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">Description</span>
        <MentionComposer
          key={composerKey}
          teamId={teamId}
          initialValue={draftDescription}
          submitLabel={isEdit ? "Save task" : "Create task"}
          placeholder="What to test and why. Use + to link a card, @ to mention a teammate."
          ariaLabel="Task description"
          isPending={mutation.isPending}
          enableCardMentions
          onSubmit={handleSubmit}
          onCancel={onDone}
        />
      </div>

      {mutation.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {mutation.error instanceof ApiError ? mutation.error.message : "Could not save the task."}
        </p>
      ) : null}
    </div>
  );
}
