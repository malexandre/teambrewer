import { Link } from "@tanstack/react-router";
import { Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { formatMetaDate } from "./meta-display";
import { useMetas } from "./use-metas";

/**
 * The team's non-archived metas as newest-first cards (by start date). Each card leads
 * with a Target glyph (the meta = the field to beat; matches the sidebar's Metas icon),
 * then the meta name, format, and full date window. There is no "current meta": the
 * newest of each format is simply first. Mobile-first; each card links to the meta hub.
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
      {metas.map((meta) => (
        <li key={meta.id}>
          <Link
            to="/metas/$metaId"
            params={{ metaId: meta.id }}
            className="flex h-full items-start gap-3 rounded-lg border border-border bg-card p-3 shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/40"
          >
            <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
              <Target className="size-5" aria-hidden="true" />
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
      ))}
    </ul>
  );
}
