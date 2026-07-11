import { useQueryClient } from "@tanstack/react-query";
import type { TeamMembershipSummary } from "@teambrewer/shared";
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react";

import { useMyTeams } from "./use-my-teams";

interface ActiveTeamContextValue {
  teams: TeamMembershipSummary[];
  activeTeam: TeamMembershipSummary | null;
  setActiveTeam: (teamId: string) => void;
  isPending: boolean;
}

const STORAGE_KEY = "teambrewer-active-team";
const ActiveTeamContext = createContext<ActiveTeamContextValue | undefined>(undefined);

/**
 * Holds the active team resolved from the caller's memberships. The chosen team
 * is persisted, always validated against the memberships the API returned (a
 * stale/forged id never survives), and switching invalidates cached queries so
 * one team's data can never render under another (security-and-tenancy rule).
 */
export function ActiveTeamProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = useMyTeams();
  const queryClient = useQueryClient();
  const teams = useMemo(() => data?.data ?? [], [data]);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(
    () => localStorage.getItem(STORAGE_KEY),
  );

  const activeTeam =
    teams.find((team) => team.teamId === selectedTeamId) ?? teams[0] ?? null;

  const setActiveTeam = useCallback(
    (teamId: string) => {
      localStorage.setItem(STORAGE_KEY, teamId);
      setSelectedTeamId(teamId);
      // Drop team-scoped caches so the newly active team refetches its own data.
      void queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const value = useMemo<ActiveTeamContextValue>(
    () => ({ teams, activeTeam, setActiveTeam, isPending }),
    [teams, activeTeam, setActiveTeam, isPending],
  );

  return <ActiveTeamContext value={value}>{children}</ActiveTeamContext>;
}

export function useActiveTeam(): ActiveTeamContextValue {
  const context = use(ActiveTeamContext);
  if (context === undefined) {
    throw new Error("useActiveTeam must be used within an ActiveTeamProvider");
  }
  return context;
}
