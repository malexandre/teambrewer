import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useActiveTeam } from "@/features/teams/active-team";

import { PersonalDashboard } from "./PersonalDashboard";
import { TeamDashboard } from "./TeamDashboard";

type DashboardScope = "me" | "team";

/**
 * The dashboard — the authenticated landing screen. A mobile-first, thumb-friendly
 * overview with two scopes: a personal "what should I do next?" and the team's
 * shared prep board. Both are read-only aggregations that deep-link into the owning
 * features to take action.
 */
export function DashboardPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const [scope, setScope] = useState<DashboardScope>("me");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold tracking-tight">Dashboard</h1>
        <Button
          type="button"
          size="sm"
          variant={scope === "me" ? "default" : "ghost"}
          aria-pressed={scope === "me"}
          onClick={() => setScope("me")}
        >
          For me
        </Button>
        <Button
          type="button"
          size="sm"
          variant={scope === "team" ? "default" : "ghost"}
          aria-pressed={scope === "team"}
          onClick={() => setScope("team")}
        >
          Team
        </Button>
      </div>

      {scope === "me" ? <PersonalDashboard teamId={teamId} /> : <TeamDashboard teamId={teamId} />}
    </div>
  );
}
