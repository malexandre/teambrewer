import { useQuery } from "@tanstack/react-query";
import {
  type MatchupCoverageResponse,
  matchupCoverageResponseSchema,
  type MatchupListResponse,
  matchupListResponseSchema,
  type MatchupMatrixResponse,
  matchupMatrixResponseSchema,
} from "@teambrewer/shared";

import { apiClient } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

/** The scope selectors shared by the matrix and list views. */
export interface MatchupScope {
  formatId: string;
  eventId?: string;
  byHero?: boolean;
}

function scopeKey(scope: MatchupScope): Record<string, string> {
  const key: Record<string, string> = { formatId: scope.formatId };
  if (scope.eventId) key["eventId"] = scope.eventId;
  if (scope.byHero) key["byHero"] = "true";
  return key;
}

function scopeQueryString(scope: MatchupScope): string {
  const params = new URLSearchParams({ formatId: scope.formatId });
  if (scope.eventId) params.set("eventId", scope.eventId);
  if (scope.byHero) params.set("byHero", "true");
  return `?${params.toString()}`;
}

/** The full our-decks × opponent-field matrix, via GET /api/matchups/matrix. */
export function useMatchupMatrix(teamId: string | undefined, scope: MatchupScope | undefined) {
  return useQuery<MatchupMatrixResponse>({
    queryKey:
      teamId && scope
        ? queryKeys.matchupMatrix(teamId, scopeKey(scope))
        : ["matchup-matrix", "none"],
    queryFn: () => {
      if (!teamId || !scope) {
        throw new Error("No active team or format.");
      }
      return apiClient.get(`/matchups/matrix${scopeQueryString(scope)}`, {
        teamId,
        schema: matchupMatrixResponseSchema,
      });
    },
    enabled: Boolean(teamId && scope),
  });
}

/** A flat list of matchup cells (optionally narrowed to one of our decks). */
export function useMatchupList(
  teamId: string | undefined,
  scope: (MatchupScope & { ourDeckId?: string }) | undefined,
) {
  return useQuery<MatchupListResponse>({
    queryKey:
      teamId && scope
        ? queryKeys.matchups(teamId, {
            ...scopeKey(scope),
            ...(scope.ourDeckId ? { ourDeckId: scope.ourDeckId } : {}),
          })
        : ["matchups", "none"],
    queryFn: () => {
      if (!teamId || !scope) {
        throw new Error("No active team or format.");
      }
      const params = new URLSearchParams({ formatId: scope.formatId });
      if (scope.eventId) params.set("eventId", scope.eventId);
      if (scope.byHero) params.set("byHero", "true");
      if (scope.ourDeckId) params.set("ourDeckId", scope.ourDeckId);
      return apiClient.get(`/matchups?${params.toString()}`, {
        teamId,
        schema: matchupListResponseSchema,
      });
    },
    enabled: Boolean(teamId && scope),
  });
}

/** The scope for an event's gauntlet coverage. */
export interface CoverageScope {
  eventId: string;
  byHero?: boolean;
  minEffectiveSample?: number;
}

/** An event's gauntlet coverage, via GET /api/matchups/coverage. */
export function useMatchupCoverage(teamId: string | undefined, scope: CoverageScope | undefined) {
  return useQuery<MatchupCoverageResponse>({
    queryKey:
      teamId && scope
        ? queryKeys.matchupCoverage(teamId, {
            eventId: scope.eventId,
            ...(scope.byHero ? { byHero: "true" } : {}),
            ...(scope.minEffectiveSample !== undefined
              ? { minEffectiveSample: String(scope.minEffectiveSample) }
              : {}),
          })
        : ["matchup-coverage", "none"],
    queryFn: () => {
      if (!teamId || !scope) {
        throw new Error("No active team or event.");
      }
      const params = new URLSearchParams({ eventId: scope.eventId });
      if (scope.byHero) params.set("byHero", "true");
      if (scope.minEffectiveSample !== undefined) {
        params.set("minEffectiveSample", String(scope.minEffectiveSample));
      }
      return apiClient.get(`/matchups/coverage?${params.toString()}`, {
        teamId,
        schema: matchupCoverageResponseSchema,
      });
    },
    enabled: Boolean(teamId && scope),
  });
}
