import type { ActivityVerb } from "@teambrewer/shared";

import { ACTIVITY_VERB_LABELS } from "./activity-display";
import { type ActivityFilters, useActivity } from "./use-activity";

/**
 * The activity feed, newest-first (docs/features/collaboration-core.md). Rendered
 * filtered by subject as a per-subject activity section on detail pages (deck,
 * game log, …).
 */
export function ActivityFeed({
  teamId,
  filters = {},
  title = "Activity",
}: {
  teamId: string | undefined;
  filters?: ActivityFilters;
  title?: string;
}) {
  const { data } = useActivity(teamId, filters);
  const events = data?.data ?? [];

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="rounded-md border border-border p-2 text-sm">
              <span className="font-medium">{event.actor.displayName}</span>{" "}
              {ACTIVITY_VERB_LABELS[event.verb as ActivityVerb] ?? event.verb}
              <span className="block text-xs text-muted-foreground">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
