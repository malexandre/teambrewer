import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CommentThread } from "@/features/collaboration/CommentThread";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";

import { PrimerEditor } from "./PrimerEditor";
import { usePrimer } from "./use-primers";
import { useArchivePrimer } from "./use-primer-mutations";

/**
 * A single primer's read view: title, metadata, the pre-wrapped body, edit/archive
 * actions (any member may edit a visible primer; author or team-admin may archive), and
 * the shared comment thread. The body is rendered as plain text — React escapes it, so
 * embedded HTML/script is shown literally, never executed.
 */
export function PrimerDetail({ primerId }: { primerId: string }) {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const { data: user } = useCurrentUser();
  const { data: primer, isPending, isError } = usePrimer(teamId, primerId);
  const archive = useArchivePrimer(teamId, primerId);
  const [editing, setEditing] = useState(false);

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading primer…</p>;
  }
  if (isError || !primer) {
    return <p className="text-sm text-muted-foreground">This primer could not be found.</p>;
  }

  const canArchive = primer.authorId === user?.id || activeTeam?.role === "team_admin";

  if (editing) {
    return <PrimerEditor teamId={teamId} existing={primer} onDone={() => setEditing(false)} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <article className="flex flex-col gap-3">
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">{primer.title}</h1>
            <p className="text-xs text-muted-foreground">
              {primer.relatedDeckName ? `${primer.relatedDeckName} · ` : ""}
              {primer.visibility === "private" ? "Private · " : ""}by {primer.author.displayName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {canArchive ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={archive.isPending}
                onClick={() => archive.mutate()}
              >
                Archive
              </Button>
            ) : null}
          </div>
        </header>
        <p className="whitespace-pre-wrap text-sm">{primer.body}</p>
      </article>

      <CommentThread
        teamId={teamId}
        subjectType="primer"
        subjectId={primer.id}
        canComment={primer.archivedAt === null}
      />
    </div>
  );
}
