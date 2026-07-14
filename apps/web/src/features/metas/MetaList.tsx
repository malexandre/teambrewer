import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";

import { calendarParts, formatMetaDate } from "./meta-display";
import { useMetas } from "./use-metas";

/**
 * The team's non-archived metas as newest-first calendar cards (by start date). Each
 * card leads with a calendar-page motif for the window's start, then the meta name,
 * format, and full date window. There is no "current meta": the newest of each format
 * is simply first. Mobile-first; each card links to the meta hub.
 */
export function MetaList({ teamId }: { teamId: string | undefined }) {
  const { data, isPending, isError } = useMetas(teamId);
  const metas = data?.data ?? [];

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading metas…</p>;
  }
  if (isError) {
    return <p className="text-sm text-destructive">Could not load metas.</p>;
  }
  if (metas.length === 0) {
    return <p className="text-sm text-muted-foreground">No metas yet.</p>;
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {metas.map((meta) => {
        const start = calendarParts(meta.startDate);
        return (
          <li key={meta.id}>
            <Link
              to="/metas/$metaId"
              params={{ metaId: meta.id }}
              className="flex h-full items-stretch gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/40"
            >
              {/* Calendar-page motif for the window's start date. */}
              <div className="flex w-14 shrink-0 flex-col overflow-hidden rounded-md border border-border">
                <div className="bg-primary py-0.5 text-center text-[0.6rem] font-bold uppercase tracking-wide text-primary-foreground">
                  {start.month}
                </div>
                <div className="grid flex-1 place-items-center bg-card py-1 text-xl font-bold tabular-nums">
                  {start.day}
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-semibold leading-tight" title={meta.name}>
                  {meta.name}
                </span>
                <Badge tone="primary" size="sm" className="self-start">
                  {meta.formatName}
                </Badge>
                <span className="mt-auto text-xs text-muted-foreground">
                  {formatMetaDate(meta.startDate)} → {formatMetaDate(meta.endDate)}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
