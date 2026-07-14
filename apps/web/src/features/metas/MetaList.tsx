import { Link } from "@tanstack/react-router";

import { formatMetaDate } from "./meta-display";
import { useCurrentMeta, useMetas } from "./use-metas";

/**
 * The team's non-archived metas as a distinct section beneath the page's "Current
 * meta" callout. When a meta is current it is surfaced by that callout, so this
 * list **excludes** it and heads itself "Other metas"; when none is current it
 * lists every meta under "All metas". Mobile-first; each row links to the meta hub.
 */
export function MetaList({ teamId }: { teamId: string | undefined }) {
  const { data, isPending, isError } = useMetas(teamId);
  const { data: currentMeta } = useCurrentMeta(teamId);
  const allMetas = data?.data ?? [];
  const metas = currentMeta ? allMetas.filter((meta) => meta.id !== currentMeta.id) : allMetas;
  const heading = currentMeta ? "Other metas" : "All metas";

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{heading}</h3>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading metas…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Could not load metas.</p>
      ) : metas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {currentMeta ? "No other metas yet." : "No metas yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {metas.map((meta) => (
            <li key={meta.id}>
              <Link
                to="/metas/$metaId"
                params={{ metaId: meta.id }}
                className="flex flex-col gap-1 rounded-md border border-border p-3 hover:bg-accent"
              >
                <span className="font-medium">{meta.name}</span>
                <span className="text-xs text-muted-foreground">
                  {formatMetaDate(meta.startDate)} → {formatMetaDate(meta.endDate)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
