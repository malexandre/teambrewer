import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveTeam } from "@/features/teams/active-team";

import { EventForm } from "./EventForm";
import { EventList } from "./EventList";

/** The team's events: browse/filter the list and create a new event. */
export function EventsPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Events</CardTitle>
          <Button size="sm" onClick={() => setCreating((open) => !open)}>
            {creating ? "Close" : "New event"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {creating ? (
          <EventForm
            teamId={teamId}
            onSaved={(event) => {
              setCreating(false);
              void navigate({ to: "/events/$eventId", params: { eventId: event.id } });
            }}
            onCancel={() => setCreating(false)}
          />
        ) : null}
        <EventList teamId={teamId} />
      </CardContent>
    </Card>
  );
}
