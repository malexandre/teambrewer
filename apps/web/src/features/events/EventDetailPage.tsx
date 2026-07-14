import { Link } from "@tanstack/react-router";

import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";

import { EventDetail } from "./EventDetail";
import { useEvent } from "./use-events";

/** Detail route for a single event; renders 404-safe states around {@link EventDetail}. */
export function EventDetailPage({ eventId }: { eventId: string }) {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const { data: event, isPending, error } = useEvent(teamId, eventId);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/events" className="text-sm text-muted-foreground hover:underline">
        ← Back to events
      </Link>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading event…</p>
      ) : error ? (
        <p className="text-sm text-destructive">
          {error instanceof ApiError && error.status === 404
            ? "This event does not exist or is not visible to you."
            : "Could not load this event."}
        </p>
      ) : event ? (
        <EventDetail teamId={teamId} event={event} />
      ) : null}
    </div>
  );
}
