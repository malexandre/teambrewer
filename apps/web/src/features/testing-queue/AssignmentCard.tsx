import type { TestAssignment, TestAssignmentStatus } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ActivityFeed } from "@/features/collaboration/ActivityFeed";
import { CommentThread } from "@/features/collaboration/CommentThread";

import { AssignmentStatusControl } from "./AssignmentStatusControl";
import { ASSIGNMENT_STATUS_LABELS } from "./testing-queue-display";
import { useArchiveAssignment, useUpdateAssignment } from "./use-assignment-mutations";

/**
 * One test assignment: our deck × the opponent (shown via the durable snapshot
 * label), the assignee, the target game count, and its status. The creator, assignee,
 * or a team-admin gets the status control and archive. Discussion (comments +
 * activity) is revealed on demand so a long list stays light.
 */
export function AssignmentCard({
  teamId,
  assignment,
  canModify,
}: {
  teamId: string | undefined;
  assignment: TestAssignment;
  canModify: boolean;
}) {
  const updateAssignment = useUpdateAssignment(teamId, assignment.id);
  const archiveAssignment = useArchiveAssignment(teamId, assignment.id);
  const [showDiscussion, setShowDiscussion] = useState(false);

  function changeStatus(next: TestAssignmentStatus) {
    updateAssignment.mutate({ status: next });
  }

  return (
    <article className="flex flex-col gap-2 rounded-md border border-input p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">
            <span>{assignment.deckName}</span> <span className="text-muted-foreground">vs</span>{" "}
            <span>{assignment.opponentSnapshotLabel}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {assignment.assignee.displayName}
            {assignment.targetGames !== null ? ` · target ${assignment.targetGames} games` : ""}
          </p>
        </div>
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
          {ASSIGNMENT_STATUS_LABELS[assignment.status]}
        </span>
      </div>

      {assignment.notes ? (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{assignment.notes}</p>
      ) : null}

      {canModify ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-input pt-2">
          <AssignmentStatusControl
            status={assignment.status}
            onChange={changeStatus}
            disabled={updateAssignment.isPending}
          />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={archiveAssignment.isPending}
            onClick={() => archiveAssignment.mutate()}
          >
            Archive
          </Button>
        </div>
      ) : null}

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="self-start"
        aria-expanded={showDiscussion}
        onClick={() => setShowDiscussion((open) => !open)}
      >
        {showDiscussion ? "Hide discussion" : "Discussion"}
      </Button>

      {showDiscussion ? (
        <div className="flex flex-col gap-4 border-t border-input pt-2">
          <CommentThread
            teamId={teamId}
            subjectType="test_assignment"
            subjectId={assignment.id}
            canComment
          />
          <ActivityFeed
            teamId={teamId}
            filters={{ subjectType: "test_assignment", subjectId: assignment.id }}
            title="Assignment activity"
          />
        </div>
      ) : null}
    </article>
  );
}
