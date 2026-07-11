import { useQuery } from "@tanstack/react-query";
import { currentUserSchema, type CurrentUser } from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/**
 * The authenticated caller (GET /api/me). Because the API only sets `userId`
 * once a password account has completed mandatory TOTP, a 401 here means "not
 * fully authenticated" — the router treats that as signed-out.
 */
export function useCurrentUser() {
  return useQuery<CurrentUser>({
    queryKey: queryKeys.me(),
    queryFn: () => apiClient.get("/me", { schema: currentUserSchema }),
    retry: false,
    staleTime: 30_000,
  });
}
