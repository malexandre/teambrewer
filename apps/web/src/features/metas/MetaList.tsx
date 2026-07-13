import { Link } from "@tanstack/react-router";

import { formatMetaDate } from "./meta-display";
import { useCurrentMeta, useMetas } from "./use-metas";

/**
 * The team's non-archived metas (newest window first). The meta that contains today
 * is flagged as current. Mobile-first; each row links to the meta hub.
 */
export function MetaList({ teamId }: { teamId: string | undefined }) {
  const { data, isPending, isError } = useMetas(teamId);
  const { data: currentMeta } = useCurrentMeta(teamId);
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
    <ul className="flex flex-col gap-2">
      {metas.map((meta) => (
        <li key={meta.id}>
          <Link
            to="/metas/$metaId"
            params={{ metaId: meta.id }}
            className="flex flex-col gap-1 rounded-md border border-border p-3 hover:bg-accent"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{meta.name}</span>
              {currentMeta?.id === meta.id ? (
                <span className="rounded-md bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  Current
                </span>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground">
              {formatMetaDate(meta.startDate)} → {formatMetaDate(meta.endDate)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
