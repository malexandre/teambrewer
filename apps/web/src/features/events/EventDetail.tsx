import { useNavigate } from "@tanstack/react-router";
import type { EventDetail as EventDetailType } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";

import { AttendanceControl } from "./AttendanceControl";
import { formatEventDate } from "./event-display";
import { EventForm } from "./EventForm";
import { useArchiveEvent } from "./use-event-mutations";

/**
 * An event's detail: a lightweight, isolated social board item. Header (name, date,
 * location), an optional description, and the attendance control (RSVP + roster).
 * Permissions are a shared team board — any member may edit or archive the event.
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

  const archiveEvent = useArchiveEvent(teamId, event.id);

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
    <div className="flex flex-col gap-6">
      <PageHeader
        title={event.name}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={archive} disabled={archiveEvent.isPending}>
              Archive
            </Button>
          </>
        }
      />

      <Section title="Details" aria-label="Details">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Date</dt>
            <dd>{formatEventDate(event.date)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd>{event.location ?? "—"}</dd>
          </div>
        </dl>

        {event.description ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Description</span>
            <p className="whitespace-pre-wrap text-sm">{event.description}</p>
          </div>
        ) : null}
      </Section>

      <AttendanceControl teamId={teamId} eventId={event.id} />
    </div>
  );
}
