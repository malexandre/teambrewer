import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  type CreateTestAssignmentInput,
  type TestAssignment,
  testAssignmentSchema,
  type UpdateTestAssignmentInput,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";

/** Require an active team before a mutation runs (pages only render one when present). */
function requireTeam(teamId: string | undefined): string {
  if (!teamId) {
    throw new Error("No active team.");
  }
  return teamId;
}

/** Assign a test (POST /api/test-assignments); invalidates the team's assignment lists. */
export function useCreateAssignment(teamId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTestAssignmentInput) =>
      apiClient.post<TestAssignment>("/test-assignments", {
        teamId: requireTeam(teamId),
        body: input,
        schema: testAssignmentSchema,
      }),
    onSuccess: () => invalidateAssignments(queryClient, teamId),
  });
}

/** Update / transition an assignment (PATCH /api/test-assignments/:assignmentId). */
export function useUpdateAssignment(teamId: string | undefined, assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTestAssignmentInput) =>
      apiClient.patch<TestAssignment>(`/test-assignments/${assignmentId}`, {
        teamId: requireTeam(teamId),
        body: input,
        schema: testAssignmentSchema,
      }),
    onSuccess: () => invalidateAssignments(queryClient, teamId),
  });
}

/** Archive an assignment (DELETE /api/test-assignments/:assignmentId). */
export function useArchiveAssignment(teamId: string | undefined, assignmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.delete<void>(`/test-assignments/${assignmentId}`, {
        teamId: requireTeam(teamId),
      }),
    onSuccess: () => invalidateAssignments(queryClient, teamId),
  });
}

function invalidateAssignments(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: [teamId, "test-assignments"] });
}
