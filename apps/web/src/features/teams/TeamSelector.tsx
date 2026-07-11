import { useActiveTeam } from "./active-team";

/**
 * Active-team selector. Lists only the caller's teams; a single-team user sees
 * the name without a control. Changing the selection switches the active team
 * (which invalidates team-scoped caches — see {@link ActiveTeamProvider}).
 */
export function TeamSelector() {
  const { teams, activeTeam, setActiveTeam } = useActiveTeam();

  if (teams.length === 0) {
    return null;
  }

  if (teams.length === 1) {
    return <span className="text-sm font-medium">{activeTeam?.name}</span>;
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Active team</span>
      <select
        aria-label="Active team"
        className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={activeTeam?.teamId ?? ""}
        onChange={(event) => setActiveTeam(event.target.value)}
      >
        {teams.map((team) => (
          <option key={team.teamId} value={team.teamId}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  );
}
