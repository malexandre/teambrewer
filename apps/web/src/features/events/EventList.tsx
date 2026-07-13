import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useMetas } from "@/features/metas/use-metas";

import { formatEventDate, SELECT_CLASS } from "./event-display";
import { type EventFilters, useEvents } from "./use-events";

/**
 * The team's events with an optional meta filter. Mobile-first; each row links to
 * the event detail. Linked meta ids are resolved to names via the metas list.
 */
export function EventList({ teamId }: { teamId: string | undefined }) {
  const [metaId, setMetaId] = useState("");

  const filters: EventFilters = { ...(metaId ? { metaId } : {}) };

  const { data, isPending, isError } = useEvents(teamId, filters);
  const { data: metaData } = useMetas(teamId);
  const metaNames = useMemo(
    () => new Map((metaData?.data ?? []).map((meta) => [meta.id, meta.name])),
    [metaData],
  );

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
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                to="/events/$eventId"
                params={{ eventId: event.id }}
                className="flex flex-col gap-1 rounded-md border border-border p-3 hover:bg-accent"
              >
                <span className="font-medium">{event.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatEventDate(event.date)}
                  {event.location ? ` · ${event.location}` : ""}
                  {event.metaId ? ` · ${metaNames.get(event.metaId) ?? "Meta"}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
