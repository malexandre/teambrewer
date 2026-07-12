import { Link } from "@tanstack/react-router";
import {
  type EventImportance,
  eventImportanceSchema,
  eventStatusSchema,
  type EventStatus,
} from "@teambrewer/shared";
import { useMemo, useState } from "react";

import { useFormats } from "@/features/cards/use-formats";
import { FormatPicker } from "@/features/decks/FormatPicker";

import {
  EVENT_IMPORTANCE_LABELS,
  EVENT_STATUS_LABELS,
  formatEventDate,
  SELECT_CLASS,
} from "./event-display";
import { type EventFilters, useEvents } from "./use-events";

/**
 * The team's events with filters (status, format, importance). Mobile-first; each
 * row links to the event hub. Format ids are resolved to names via reference data.
 */
export function EventList({ teamId }: { teamId: string | undefined }) {
  const [status, setStatus] = useState<EventStatus | "">("");
  const [formatId, setFormatId] = useState("");
  const [importance, setImportance] = useState<EventImportance | "">("");

  const filters: EventFilters = {
    ...(status ? { status } : {}),
    ...(formatId ? { formatId } : {}),
    ...(importance ? { importance } : {}),
  };

  const { data, isPending, isError } = useEvents(teamId, filters);
  const { data: formatData } = useFormats(teamId);
  const formatNames = useMemo(
    () => new Map((formatData?.data ?? []).map((format) => [format.id, format.name])),
    [formatData],
  );

  const events = data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <select
          className={SELECT_CLASS}
          value={status}
          onChange={(event) => setStatus(event.target.value as EventStatus | "")}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {eventStatusSchema.options.map((option) => (
            <option key={option} value={option}>
              {EVENT_STATUS_LABELS[option]}
            </option>
          ))}
        </select>
        <FormatPicker teamId={teamId} value={formatId} onChange={setFormatId} />
        <select
          className={SELECT_CLASS}
          value={importance}
          onChange={(event) => setImportance(event.target.value as EventImportance | "")}
          aria-label="Filter by importance"
        >
          <option value="">All importances</option>
          {eventImportanceSchema.options.map((option) => (
            <option key={option} value={option}>
              {EVENT_IMPORTANCE_LABELS[option]}
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
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{event.name}</span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs">
                    {EVENT_STATUS_LABELS[event.status]}
                  </span>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {EVENT_IMPORTANCE_LABELS[event.importance]}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatEventDate(event.date)}
                  {" · "}
                  {formatNames.get(event.formatId) ?? "Unknown format"}
                  {event.location ? ` · ${event.location}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
