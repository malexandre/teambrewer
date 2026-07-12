import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEvents } from "@/features/events/use-events";
import {
  formatEffectiveSample,
  SELECT_CLASS,
  summarizeCell,
  TRUST_INDICATOR_BADGE_CLASS,
} from "@/features/matchups/matchup-display";

import {
  formatScore,
  opponentSummary,
  OUTCOME_BADGE_CLASS,
  OUTCOME_LABELS,
} from "./dashboard-display";
import { useDashboardTeam } from "./use-dashboard";

const BADGE_CLASS = "rounded-md bg-muted px-2 py-0.5 text-xs";

/**
 * The team's shared surface for the target event (nearest upcoming, or a selected
 * one): the ranked "what to test next" list, the condensed coverage gaps with who's
 * assigned, recent team results, and an activity slice. Read-only — every widget
 * deep-links into its owning feature.
 */
export function TeamDashboard({ teamId }: { teamId: string | undefined }) {
  const [eventId, setEventId] = useState("");
  const { data: eventData } = useEvents(teamId, { status: "upcoming" });
  const upcomingEvents = eventData?.data ?? [];

  const { data, isPending, isError } = useDashboardTeam(teamId, eventId || undefined);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Event</span>
          <select
            className={SELECT_CLASS}
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
            aria-label="Target event"
          >
            <option value="">Nearest upcoming</option>
            {upcomingEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {event.name}
              </option>
            ))}
          </select>
        </label>
        {data?.targetEvent ? (
          <span className="text-sm text-muted-foreground">
            Preparing for <span className="font-medium">{data.targetEvent.name}</span>
          </span>
        ) : null}
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading the team dashboard…</p>
      ) : isError || !data ? (
        <p className="text-sm text-destructive">Could not load the team dashboard.</p>
      ) : !data.targetEvent ? (
        <p className="text-sm text-muted-foreground">
          No upcoming event yet.{" "}
          <Link to="/events" className="underline">
            Create one
          </Link>{" "}
          to plan what to test.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="sm:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>What to test next</CardTitle>
              <Link to="/matchups" className="text-sm text-muted-foreground hover:underline">
                Open matchups
              </Link>
            </CardHeader>
            <CardContent>
              {data.recommendation.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This event has no gauntlet yet — add the expected field to get recommendations.
                </p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {data.recommendation.map((priority) => (
                    <li
                      key={priority.opponentKey}
                      className="flex flex-col gap-1 rounded-md border border-border p-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{priority.opponentLabel}</span>
                        <span className={`${BADGE_CLASS} ml-auto`}>
                          priority {priority.priorityScore.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{priority.reason}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Coverage gaps</CardTitle>
            </CardHeader>
            <CardContent>
              {data.coverageGaps.length === 0 ? (
                <p className="text-sm text-muted-foreground">Every gauntlet matchup is covered.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.coverageGaps.map((gap) => (
                    <li
                      key={gap.gauntletEntryId}
                      className="flex flex-col gap-1 rounded-md border border-border p-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{gap.opponent.label}</span>
                        <span
                          className={`${BADGE_CLASS} ml-auto ${
                            TRUST_INDICATOR_BADGE_CLASS[gap.aggregate.trustIndicator]
                          }`}
                        >
                          eff {formatEffectiveSample(gap.aggregate.effectiveSample)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {summarizeCell(gap.aggregate)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {gap.assignees.length > 0
                          ? `Assigned: ${gap.assignees.join(", ")}`
                          : "Unassigned"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recent team results</CardTitle>
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

          <Card className="sm:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Team activity</CardTitle>
              <Link to="/activity" className="text-sm text-muted-foreground hover:underline">
                View all
              </Link>
            </CardHeader>
            <CardContent>
              {data.activityHighlights.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {data.activityHighlights.map((entry) => (
                    <li key={entry.id} className="text-muted-foreground">
                      <span className="font-medium text-foreground">{entry.actor.displayName}</span>{" "}
                      {entry.verb.replace(/_/g, " ")} · {entry.subjectType.replace(/_/g, " ")}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
