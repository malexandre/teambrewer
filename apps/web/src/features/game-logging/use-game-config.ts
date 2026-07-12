import { useQuery } from "@tanstack/react-query";
import { type GameConfig, gameConfigSchema } from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The active team's per-game UI config (GET /api/game-config). */
export function useGameConfig(teamId: string | undefined) {
  return useQuery<GameConfig>({
    queryKey: teamId ? queryKeys.gameConfig(teamId) : ["game-config", "none"],
    queryFn: () => {
      if (!teamId) {
        throw new Error("No active team.");
      }
      return apiClient.get("/game-config", { teamId, schema: gameConfigSchema });
    },
    enabled: Boolean(teamId),
  });
}
