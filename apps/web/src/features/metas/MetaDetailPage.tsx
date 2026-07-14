import { Link } from "@tanstack/react-router";

import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";

import { MetaDetail } from "./MetaDetail";
import { useCurrentMeta, useMeta } from "./use-metas";

/** Detail route for a single meta; renders 404-safe states around {@link MetaDetail}. */
export function MetaDetailPage({ metaId }: { metaId: string }) {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const { data: meta, isPending, error } = useMeta(teamId, metaId);
  const { data: currentMeta } = useCurrentMeta(teamId);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/metas" className="text-sm text-muted-foreground hover:underline">
        ← Back to metas
      </Link>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading meta…</p>
      ) : error ? (
        <p className="text-sm text-destructive">
          {error instanceof ApiError && error.status === 404
            ? "This meta does not exist or is not visible to you."
            : "Could not load this meta."}
        </p>
      ) : meta ? (
        <MetaDetail teamId={teamId} meta={meta} isCurrent={currentMeta?.id === meta.id} />
      ) : null}
    </div>
  );
}
