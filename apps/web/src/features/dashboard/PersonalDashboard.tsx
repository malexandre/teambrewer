import { Link } from "@tanstack/react-router";
import type { AttendanceStatus } from "@teambrewer/shared";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  formatEventDate,
  formatScore,
  opponentSummary,
  OUTCOME_BADGE_CLASS,
  OUTCOME_LABELS,
} from "./dashboard-display";
import { useDashboardMe } from "./use-dashboard";

/** RSVP labels for the upcoming-event strip (a nudge when unset). */
const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  going: "Going",
  maybe: "Maybe",
  not_going: "Not going",
};

const BADGE_CLASS = "rounded-md bg-muted px-2 py-0.5 text-xs";

/**
 * The caller's "what should I do next?" surface: my open test assignments, the
 * nearest upcoming events with my RSVP + deck selection (nudging when unset), and my
 * recent results. Every widget deep-links into its owning feature to take action.
 */
export function PersonalDashboard({ teamId }: { teamId: string | undefined }) {
  const { data, isPending, isError } = useDashboardMe(teamId);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading your dashboard…</p>;
  }
  if (isError || !data) {
    return <p className="text-sm text-destructive">Could not load your dashboard.</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>My test assignments</CardTitle>
          <Link to="/assignments" className="text-sm text-muted-foreground hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {data.assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matchups assigned to you right now.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.assignments.map((assignment) => (
                <li
                  key={assignment.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
                >
                  <span className="font-medium">{assignment.opponentSnapshotLabel}</span>
                  <span className="text-sm text-muted-foreground">with {assignment.deckName}</span>
                  <span className={`${BADGE_CLASS} ml-auto`}>
                    {assignment.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Upcoming events</CardTitle>
          <Link to="/events" className="text-sm text-muted-foreground hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {data.upcomingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming events.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.upcomingEvents.map(({ event, myAttendance, myDeckSelection }) => (
                <li key={event.id}>
                  <Link
                    to="/events/$eventId"
                    params={{ eventId: event.id }}
                    className="flex flex-col gap-1 rounded-md border border-border p-2 hover:bg-accent"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{event.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatEventDate(event.date)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className={BADGE_CLASS}>
                        {myAttendance ? ATTENDANCE_LABELS[myAttendance] : "No RSVP yet"}
                      </span>
                      <span className={BADGE_CLASS}>
                        {myDeckSelection
                          ? `Deck: ${myDeckSelection.deckName}`
                          : "No deck selected yet"}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="sm:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>My recent results</CardTitle>
          <Link to="/games" className="text-sm text-muted-foreground hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {data.recentResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No games logged yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.recentResults.map(({ log, outcome }) => (
                <li key={log.id}>
                  <Link
                    to="/games/$gameLogId"
                    params={{ gameLogId: log.id }}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 hover:bg-accent"
                  >
                    <span className={`${BADGE_CLASS} ${OUTCOME_BADGE_CLASS[outcome]}`}>
                      {OUTCOME_LABELS[outcome]}
                    </span>
                    <span className="text-sm">{formatScore(log.result)}</span>
                    <span className="text-sm text-muted-foreground">
                      vs {opponentSummary(log.sideB)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
