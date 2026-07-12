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

/**
 * The active game's word for its deck-identity concept ("Hero" for Flesh and
 * Blood, "Legend" for Riftbound), driven by the game adapter via game-config.
 * Every UI identity label reads this rather than hard-coding a game's term. Falls
 * back to "Hero" only while the config loads (the primary game).
 */
export function useIdentityLabel(teamId: string | undefined): string {
  const { data } = useGameConfig(teamId);
  return data?.identityLabel ?? "Hero";
}
