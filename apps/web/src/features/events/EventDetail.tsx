import { useNavigate } from "@tanstack/react-router";
import type { EventDetail as EventDetailType } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useFormats } from "@/features/cards/use-formats";
import { ActivityFeed } from "@/features/collaboration/ActivityFeed";
import { CommentThread } from "@/features/collaboration/CommentThread";
import { ApiError } from "@/lib/api-client";

import { AttendanceControl } from "./AttendanceControl";
import { EVENT_IMPORTANCE_LABELS } from "./event-display";
import { EventForm } from "./EventForm";
import { EventStatusControl } from "./EventStatusControl";
import { GauntletBuilder } from "./GauntletBuilder";
import { useArchiveEvent, useUpdateEvent } from "./use-event-mutations";

/**
 * An event's detail: the prep hub. Header (name, format, date, importance, status),
 * the gauntlet builder (the field to beat), and attendance. Permissions are a
 * shared team board — any member may edit the event, its gauntlet, and archive it.
 * Editing swaps in the event form in place.
 */
export function EventDetail({
  teamId,
  event,
}: {
  teamId: string | undefined;
  event: EventDetailType;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

  const updateEvent = useUpdateEvent(teamId, event.id);
  const archiveEvent = useArchiveEvent(teamId, event.id);
  const { data: formatData } = useFormats(teamId);
  const formatName = formatData?.data.find((format) => format.id === event.formatId)?.name;

  if (editing) {
    return (
      <EventForm
        teamId={teamId}
        event={event}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  function archive() {
    if (!window.confirm("Archive this event? It will be hidden but its history is kept.")) return;
    archiveEvent.mutate(undefined, { onSuccess: () => void navigate({ to: "/events" }) });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">{event.name}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={archive} disabled={archiveEvent.isPending}>
            Archive
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Format</dt>
          <dd>{formatName ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Date</dt>
          <dd>{new Date(event.date).toLocaleDateString()}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Importance</dt>
          <dd>{EVENT_IMPORTANCE_LABELS[event.importance]}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Location</dt>
          <dd>{event.location ?? "—"}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Status</span>
        <EventStatusControl
          status={event.status}
          disabled={updateEvent.isPending}
          onChange={(next) => updateEvent.mutate({ status: next })}
        />
        {updateEvent.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {updateEvent.error instanceof ApiError
              ? updateEvent.error.message
              : "Could not update the event."}
          </p>
        ) : null}
      </div>

      {event.description ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">Description</h3>
          <p className="whitespace-pre-wrap text-sm">{event.description}</p>
        </section>
      ) : null}

      <GauntletBuilder teamId={teamId} eventId={event.id} entries={event.gauntletEntries} canEdit />

      <AttendanceControl teamId={teamId} eventId={event.id} />

      <CommentThread teamId={teamId} subjectType="event" subjectId={event.id} canComment />

      <ActivityFeed
        teamId={teamId}
        filters={{ subjectType: "event", subjectId: event.id }}
        title="Event activity"
      />
    </div>
  );
}
