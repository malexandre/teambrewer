import type { Decision } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommentThread } from "@/features/collaboration/CommentThread";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";

import { DecisionEditor } from "./DecisionEditor";

/**
 * One decision in the log: title + decision always visible; context, rationale, the
 * related-subject snapshot, edit action, and discussion revealed on expand. Author or a
 * team-admin may edit. Prose renders as pre-wrapped plain text.
 */
export function DecisionCard({
  teamId,
  decision,
}: {
  teamId: string | undefined;
  decision: Decision;
}) {
  const { activeTeam } = useActiveTeam();
  const { data: user } = useCurrentUser();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  const canEdit = decision.authorId === user?.id || activeTeam?.role === "team_admin";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          <button
            type="button"
            className="text-left hover:underline"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {decision.title}
          </button>
        </CardTitle>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{decision.decision}</p>
      </CardHeader>
      {expanded ? (
        <CardContent className="flex flex-col gap-3">
          {editing ? (
            <DecisionEditor teamId={teamId} existing={decision} onDone={() => setEditing(false)} />
          ) : (
            <>
              <div className="flex flex-col gap-2 text-sm">
                <div>
                  <span className="font-medium">Context: </span>
                  <span className="whitespace-pre-wrap">{decision.context}</span>
                </div>
                <div>
                  <span className="font-medium">Rationale: </span>
                  <span className="whitespace-pre-wrap">{decision.rationale}</span>
                </div>
                {decision.relatedSubjectSnapshotLabel ? (
                  <p className="text-xs text-muted-foreground">
                    Related: {decision.relatedSubjectSnapshotLabel}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">by {decision.author.displayName}</p>
              </div>
              {canEdit ? (
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </Button>
                </div>
              ) : null}
              <CommentThread
                teamId={teamId}
                subjectType="decision"
                subjectId={decision.id}
                canComment={decision.archivedAt === null}
              />
            </>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}
