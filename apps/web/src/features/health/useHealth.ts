import { useQuery } from "@tanstack/react-query";
import { healthResponseSchema, type HealthResponse } from "@teambrewer/shared";

/**
 * Fetches GET /api/health and parses the response with the shared schema, so
 * the web and the API validate against the exact same contract.
 */
export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: async () => {
      const response = await fetch("/api/health");
      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}`);
      }
      return healthResponseSchema.parse(await response.json());
    },
  });
}
