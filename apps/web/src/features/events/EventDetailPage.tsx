import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <Link to="/events" className="text-sm text-muted-foreground hover:underline">
          ← Back to events
        </Link>
        <CardTitle className="sr-only">Event</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}
