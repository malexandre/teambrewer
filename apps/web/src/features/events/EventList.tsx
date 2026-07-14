import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { calendarParts } from "@/features/metas/meta-display";
import { useMetas } from "@/features/metas/use-metas";

import { formatEventDate, SELECT_CLASS } from "./event-display";
import { type EventFilters, useEvents } from "./use-events";

/**
 * The team's events (optional meta filter) as a 3-up card grid. Each card leads with a
 * calendar-page motif for the date, then rows for the title, location, and full date,
 * with the going count on the right. Mobile-first; each card links to the event detail.
 */
export function EventList({ teamId }: { teamId: string | undefined }) {
  const [metaId, setMetaId] = useState("");

  const filters: EventFilters = { ...(metaId ? { metaId } : {}) };

  const { data, isPending, isError } = useEvents(teamId, filters);
  const { data: metaData } = useMetas(teamId);

  const events = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <select
          className={SELECT_CLASS}
          value={metaId}
          onChange={(event) => setMetaId(event.target.value)}
          aria-label="Filter by meta"
        >
          <option value="">All metas</option>
          {(metaData?.data ?? []).map((meta) => (
            <option key={meta.id} value={meta.id}>
              {meta.name}
            </option>
          ))}
        </select>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading events…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Could not load events.</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events match these filters.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => {
            const date = calendarParts(event.date);
            return (
              <li key={event.id}>
                <Link
                  to="/events/$eventId"
                  params={{ eventId: event.id }}
                  className="flex h-full items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/40"
                >
                  {/* Calendar-page motif for the event date. */}
                  <div className="flex w-14 shrink-0 flex-col overflow-hidden rounded-md border border-border">
                    <div className="bg-primary py-0.5 text-center text-[0.6rem] font-bold uppercase tracking-wide text-primary-foreground">
                      {date.month}
                    </div>
                    <div className="grid flex-1 place-items-center bg-card py-1 text-xl font-bold tabular-nums">
                      {date.day}
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-semibold leading-tight" title={event.name}>
                      {event.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {event.location || "Location TBD"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatEventDate(event.date)}
                    </span>
                  </div>

                  <span
                    className="shrink-0 text-xs font-medium text-muted-foreground"
                    aria-label={`${event.goingCount} going`}
                  >
                    {event.goingCount} going
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
