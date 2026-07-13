import { type AttendanceStatus, attendanceStatusSchema } from "@teambrewer/shared";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { ApiError } from "@/lib/api-client";

import { ATTENDANCE_STATUS_LABELS } from "./event-display";
import { useSetMyAttendance } from "./use-event-mutations";
import { useAttendance } from "./use-events";

/**
 * The current member's RSVP (a Going / Interested toggle) plus a compact roster of
 * everyone's RSVP. Each member sets only their own attendance; the toggle reflects
 * the caller's current status.
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
  const myRsvp = roster.find((entry) => entry.user.userId === user?.id)?.status ?? null;

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Attendance</h3>

      <div className="flex flex-wrap items-center gap-2">
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

      {setMyAttendance.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {setMyAttendance.error instanceof ApiError
            ? setMyAttendance.error.message
            : "Could not update your RSVP."}
        </p>
      ) : null}

      {roster.length === 0 ? (
        <p className="text-sm text-muted-foreground">No RSVPs yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {roster.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-2">
              <span>{entry.user.displayName}</span>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {ATTENDANCE_STATUS_LABELS[entry.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
