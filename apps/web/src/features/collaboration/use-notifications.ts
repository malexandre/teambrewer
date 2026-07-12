import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type NotificationListResponse, notificationListResponseSchema } from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

function requireTeam(teamId: string | undefined): string {
  if (!teamId) {
    throw new Error("No active team.");
  }
  return teamId;
}

/** The caller's notifications for the active team, via GET /api/notifications. */
export function useNotifications(
  teamId: string | undefined,
  options: { unreadOnly?: boolean } = {},
) {
  const params = options.unreadOnly ? { unreadOnly: true } : {};
  return useQuery<NotificationListResponse>({
    queryKey: teamId ? queryKeys.notifications(teamId, params) : ["notifications", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      const query = options.unreadOnly ? "?unreadOnly=true" : "";
      return apiClient.get(`/notifications${query}`, {
        teamId,
        schema: notificationListResponseSchema,
      });
    },
    enabled: Boolean(teamId),
  });
}

/** Mark a single notification read, via PATCH /api/notifications/:id/read. */
export function useMarkNotificationRead(teamId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) =>
      apiClient.patch<void>(`/notifications/${notificationId}/read`, {
        teamId: requireTeam(teamId),
      }),
    onSuccess: () => invalidateNotifications(queryClient, teamId),
  });
}

/** Mark all notifications read (clears the badge), via POST /api/notifications/read-all. */
export function useMarkAllNotificationsRead(teamId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<void>("/notifications/read-all", { teamId: requireTeam(teamId) }),
    onSuccess: () => invalidateNotifications(queryClient, teamId),
  });
}

function invalidateNotifications(
  queryClient: ReturnType<typeof useQueryClient>,
  teamId: string | undefined,
): void {
  if (!teamId) return;
  void queryClient.invalidateQueries({ queryKey: [teamId, "notifications"] });
}
