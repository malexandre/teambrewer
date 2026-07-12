import type { Retrospective } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";

import {
  useCreateRetrospective,
  useEventRetrospective,
  useUpdateRetrospective,
} from "./use-retrospective";

/**
 * The post-event retrospective on the event hub: a long-form body plus optional
 * results-summary and learnings sections. One per event — any member writes it; the
 * author or a team-admin edits; only a team-admin archives (server-enforced). A 404
 * from the read is the normal "not written yet" state.
 */
export function RetrospectiveSection({
  teamId,
  eventId,
}: {
  teamId: string | undefined;
  eventId: string;
}) {
  const { data: user } = useCurrentUser();
  const { activeTeam } = useActiveTeam();
  const isTeamAdmin = activeTeam?.role === "team_admin";
  const { data: retrospective, isPending, error } = useEventRetrospective(teamId, eventId);
  const [editing, setEditing] = useState(false);

  const notWritten = error instanceof ApiError && error.status === 404;

  return (
    <section className="flex flex-col gap-3" aria-label="Retrospective">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Retrospective</h3>
        {retrospective && !editing ? (
          <RetrospectiveEditControls
            retrospective={retrospective}
            canEdit={retrospective.author.userId === user?.id || isTeamAdmin}
            onEdit={() => setEditing(true)}
          />
        ) : null}
      </div>

      {isPending && !notWritten ? (
        <p className="text-sm text-muted-foreground">Loading retrospective…</p>
      ) : editing && retrospective ? (
        <RetrospectiveForm
          teamId={teamId}
          eventId={eventId}
          existing={retrospective}
          onDone={() => setEditing(false)}
        />
      ) : retrospective ? (
        <RetrospectiveView retrospective={retrospective} />
      ) : (
        <RetrospectiveForm teamId={teamId} eventId={eventId} onDone={() => undefined} />
      )}
    </section>
  );
}

/** The archive control (team-admin only) shown next to an existing retrospective. */
function RetrospectiveEditControls({
  retrospective,
  canEdit,
  onEdit,
}: {
  retrospective: Retrospective;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const { activeTeam } = useActiveTeam();
  const isTeamAdmin = activeTeam?.role === "team_admin";
  return (
    <span className="flex items-center gap-1">
      {canEdit ? (
        <Button type="button" size="sm" variant="outline" onClick={onEdit}>
          Edit
        </Button>
      ) : null}
      {isTeamAdmin ? <ArchiveButton retrospective={retrospective} /> : null}
    </span>
  );
}

function ArchiveButton({ retrospective }: { retrospective: Retrospective }) {
  const { activeTeam } = useActiveTeam();
  const update = useUpdateRetrospective(
    activeTeam?.teamId,
    retrospective.eventId,
    retrospective.id,
  );
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      disabled={update.isPending}
      onClick={() => update.mutate({ archived: true })}
    >
      Archive
    </Button>
  );
}

function RetrospectiveView({ retrospective }: { retrospective: Retrospective }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3 text-sm">
      <p className="whitespace-pre-wrap">{retrospective.body}</p>
      {retrospective.resultsSummary ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Results
          </span>
          <p className="whitespace-pre-wrap">{retrospective.resultsSummary}</p>
        </div>
      ) : null}
      {retrospective.learnings ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Learnings
          </span>
          <p className="whitespace-pre-wrap">{retrospective.learnings}</p>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">By {retrospective.author.displayName}</p>
    </div>
  );
}

/** Create or edit the retrospective (body required; results/learnings optional). */
function RetrospectiveForm({
  teamId,
  eventId,
  existing,
  onDone,
}: {
  teamId: string | undefined;
  eventId: string;
  existing?: Retrospective;
  onDone: () => void;
}) {
  const [body, setBody] = useState(existing?.body ?? "");
  const [resultsSummary, setResultsSummary] = useState(existing?.resultsSummary ?? "");
  const [learnings, setLearnings] = useState(existing?.learnings ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  const create = useCreateRetrospective(teamId, eventId);
  const update = useUpdateRetrospective(teamId, eventId, existing?.id ?? "");
  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setValidationError(null);
    if (body.trim().length === 0) {
      setValidationError("A retrospective needs a body.");
      return;
    }
    if (existing) {
      update.mutate({ body, resultsSummary, learnings }, { onSuccess: onDone });
    } else {
      create.mutate({ body, resultsSummary, learnings }, { onSuccess: onDone });
    }
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      onSubmit={handleSubmit}
      aria-label={existing ? "Edit retrospective" : "Write retrospective"}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="retro-body">Review</Label>
        <textarea
          id="retro-body"
          className="min-h-24 w-full rounded-md border border-input bg-background p-2 text-sm"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="How did the event go?"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="retro-results">Results summary</Label>
        <textarea
          id="retro-results"
          className="min-h-12 w-full rounded-md border border-input bg-background p-2 text-sm"
          value={resultsSummary}
          onChange={(event) => setResultsSummary(event.target.value)}
          placeholder="e.g. 3rd of 32"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="retro-learnings">Learnings</Label>
        <textarea
          id="retro-learnings"
          className="min-h-16 w-full rounded-md border border-input bg-background p-2 text-sm"
          value={learnings}
          onChange={(event) => setLearnings(event.target.value)}
          placeholder="What to carry into the next event?"
        />
      </div>
      {validationError ? (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      ) : null}
      {mutationError ? (
        <p role="alert" className="text-sm text-destructive">
          {mutationError instanceof ApiError
            ? mutationError.message
            : "Could not save the retrospective."}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {existing ? "Save" : "Write retrospective"}
        </Button>
        {existing ? (
          <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
