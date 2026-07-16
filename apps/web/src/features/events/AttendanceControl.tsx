import { type AttendanceStatus, attendanceStatusSchema } from "@teambrewer/shared";

import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { ApiError } from "@/lib/api-client";

import { AttendeeTicket } from "./AttendeeTicket";
import { ATTENDANCE_STATUS_LABELS, summarizeTravelNeeds } from "./event-display";
import { InterestedChip } from "./InterestedChip";
import { TravelNeedsSummary } from "./TravelNeedsSummary";
import { TripEditor } from "./TripEditor";
import { useSetMyAttendance } from "./use-event-mutations";
import { useAttendance } from "./use-events";

/**
 * The event's attendance: the current member's RSVP toggle, their inline "Your trip"
 * editor (when going), and the roster — going members as boarding-pass tickets that
 * surface who still needs transport/lodging, interested members as light chips.
 */
export function AttendanceControl({
  teamId,
  eventId,
}: {
  teamId: string | undefined;
  eventId: string;
}) {
  const { data: user } = useCurrentUser();
  const { data } = useAttendance(teamId, eventId);
  const setMyAttendance = useSetMyAttendance(teamId, eventId);

  const roster = data?.data ?? [];
  const myAttendance = roster.find((entry) => entry.user.userId === user?.id) ?? null;
  const myRsvp = myAttendance?.status ?? null;

  const going = roster.filter((entry) => entry.status === "going");
  const interested = roster.filter((entry) => entry.status === "interested");
  const needs = summarizeTravelNeeds(roster);

  const rsvpToggle = (
    <div className="flex items-center gap-2">
      {attendanceStatusSchema.options.map((option) => {
        const isActive = myRsvp === option;
        return (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={isActive ? "default" : "outline"}
            aria-pressed={isActive}
            disabled={setMyAttendance.isPending}
            onClick={() => setMyAttendance.mutate({ status: option as AttendanceStatus })}
          >
            {ATTENDANCE_STATUS_LABELS[option]}
          </Button>
        );
      })}
    </div>
  );

  return (
    <Section title="Attendance" aria-label="Attendance" actions={rsvpToggle}>
      {setMyAttendance.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {setMyAttendance.error instanceof ApiError
            ? setMyAttendance.error.message
            : "Could not update your RSVP."}
        </p>
      ) : null}

      {myRsvp === "going" && myAttendance ? (
        <TripEditor teamId={teamId} eventId={eventId} myAttendance={myAttendance} />
      ) : null}

      {roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">No RSVPs yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <TravelNeedsSummary
            transportCount={needs.transportCount}
            lodgingCount={needs.lodgingCount}
          />

          {going.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                Going
                <span className="text-xs font-normal text-muted-foreground">{going.length}</span>
              </h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {going.map((entry) => (
                  <AttendeeTicket key={entry.id} attendance={entry} />
                ))}
              </div>
            </div>
          ) : null}

          {interested.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                Interested
                <span className="text-xs font-normal text-muted-foreground">
                  {interested.length}
                </span>
              </h4>
              <div className="flex flex-wrap gap-2">
                {interested.map((entry) => (
                  <InterestedChip key={entry.id} attendance={entry} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Section>
  );
}
