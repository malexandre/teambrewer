import type { TestAssignment } from "@teambrewer/shared";

import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";

import { AssignmentCard } from "./AssignmentCard";
import { useTestAssignments, type TestAssignmentFilters } from "./use-test-assignments";

/**
 * The team's test assignments (filtered), each with its status control (for the
 * creator/assignee/admin) and on-demand discussion. Modify rights are computed from
 * the current user and their role, mirroring the server's per-actor ownership.
 */
export function AssignmentList({
  teamId,
  filters,
}: {
  teamId: string | undefined;
  filters: TestAssignmentFilters;
}) {
  const { data, isPending } = useTestAssignments(teamId, filters);
  const { data: user } = useCurrentUser();
  const { activeTeam } = useActiveTeam();

  const assignments = data?.data ?? [];
  const isTeamAdmin = activeTeam?.role === "team_admin";
  const canModify = (assignment: TestAssignment) =>
    assignment.assignedBy.userId === user?.id ||
    assignment.assignee.userId === user?.id ||
    isTeamAdmin;

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading assignments…</p>;
  }
  if (assignments.length === 0) {
    return <p className="text-sm text-muted-foreground">No assignments yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {assignments.map((assignment) => (
        <AssignmentCard
          key={assignment.id}
          teamId={teamId}
          assignment={assignment}
          canModify={canModify(assignment)}
        />
      ))}
    </div>
  );
}
