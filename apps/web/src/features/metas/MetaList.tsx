import { Link } from "@tanstack/react-router";

import { formatMetaDate } from "./meta-display";
import { useMetas } from "./use-metas";

/**
 * The team's non-archived metas as a single newest-first list (by start date), each
 * row showing the meta's format and window. There is no "current meta": the newest of
 * each format is simply first. Mobile-first; each row links to the meta hub.
 */
export function MetaList({ teamId }: { teamId: string | undefined }) {
  const { data, isPending, isError } = useMetas(teamId);
  const metas = data?.data ?? [];

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">All metas</h3>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading metas…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Could not load metas.</p>
      ) : metas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No metas yet.</p>
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
                  {meta.formatName} · {formatMetaDate(meta.startDate)} →{" "}
                  {formatMetaDate(meta.endDate)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
