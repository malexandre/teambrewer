import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type AdminCreateUserInput,
  adminCreateUserResponseSchema,
  type CreateTeamInput,
  type GeneratedLink,
  generatedLinkSchema,
  teamListSchema,
  teamMemberListSchema,
  type TeamRole,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export function useAdminTeams(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.adminTeams(),
    queryFn: () => apiClient.get("/admin/teams", { schema: teamListSchema }),
    enabled,
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTeamInput) => apiClient.post("/admin/teams", { body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.adminTeams() }),
  });
}

export function useAdminMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: teamId ? queryKeys.adminMembers(teamId) : ["admin", "members", "none"],
    queryFn: () =>
      apiClient.get(`/admin/teams/${teamId}/members`, { schema: teamMemberListSchema }),
    enabled: Boolean(teamId),
  });
}

function invalidateTeam(queryClient: ReturnType<typeof useQueryClient>, teamId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.adminMembers(teamId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.members(teamId) });
}

export function useCreateUser(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AdminCreateUserInput) =>
      apiClient.post(`/admin/teams/${teamId}/users`, {
        body: input,
        schema: adminCreateUserResponseSchema,
      }),
    onSuccess: () => invalidateTeam(queryClient, teamId),
  });
}

export function useChangeRole(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: TeamRole }) =>
      apiClient.patch(`/admin/teams/${teamId}/members/${userId}`, { body: { role } }),
    onSuccess: () => invalidateTeam(queryClient, teamId),
  });
}

export function useRemoveMember(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.delete(`/admin/teams/${teamId}/members/${userId}`),
    onSuccess: () => invalidateTeam(queryClient, teamId),
  });
}

/** Per-user recovery link generation (returns the copyable link). */
export function useGenerateLink(teamId: string) {
  return useMutation({
    mutationFn: ({ userId, kind }: { userId: string; kind: "setup-link" | "reset-link" }): Promise<GeneratedLink> =>
      apiClient.post(`/admin/teams/${teamId}/users/${userId}/${kind}`, {
        schema: generatedLinkSchema,
      }),
  });
}

export function useResetTwoFactor(teamId: string) {
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.post(`/admin/teams/${teamId}/users/${userId}/reset-2fa`),
  });
}

export function useRevokeSessions(teamId: string) {
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.delete(`/admin/teams/${teamId}/users/${userId}/sessions`),
  });
}
