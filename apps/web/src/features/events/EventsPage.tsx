import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Events"
        actions={
          <Button size="sm" onClick={() => setCreating((open) => !open)}>
            {creating ? "Close" : "New event"}
          </Button>
        }
      />
      {creating ? (
        <Section title="New event">
          <EventForm
            teamId={teamId}
            onSaved={(event) => {
              setCreating(false);
              void navigate({ to: "/events/$eventId", params: { eventId: event.id } });
            }}
            onCancel={() => setCreating(false)}
          />
        </Section>
      ) : null}
      <Section aria-label="Events">
        <EventList teamId={teamId} />
      </Section>
    </div>
  );
}
