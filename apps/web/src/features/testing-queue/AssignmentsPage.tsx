import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useActiveTeam } from "@/features/teams/active-team";

import { AssignmentForm } from "./AssignmentForm";
import { AssignmentList } from "./AssignmentList";
import type { TestAssignmentFilters } from "./use-test-assignments";

type Scope = "all" | "mine";

/**
 * Test assignments management: assign a matchup, browse all the team's assignments,
 * or narrow to the ones assigned to you. Directly targets the "nobody pilots the
 * bogeyman" failure mode (playtesting-methodology §2).
 */
export function AssignmentsPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const { data: user } = useCurrentUser();
  const [assigning, setAssigning] = useState(false);
  const [scope, setScope] = useState<Scope>("all");

  const filters: TestAssignmentFilters = scope === "mine" && user ? { assigneeId: user.id } : {};

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Test assignments</CardTitle>
          <Button size="sm" onClick={() => setAssigning((open) => !open)}>
            {assigning ? "Close" : "Assign a matchup"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {assigning ? <AssignmentForm teamId={teamId} onDone={() => setAssigning(false)} /> : null}

        <div className="flex gap-2" role="group" aria-label="Assignment scope">
          <Button
            type="button"
            size="sm"
            variant={scope === "all" ? "default" : "outline"}
            onClick={() => setScope("all")}
          >
            All
          </Button>
          <Button
            type="button"
            size="sm"
            variant={scope === "mine" ? "default" : "outline"}
            onClick={() => setScope("mine")}
          >
            Assigned to me
          </Button>
        </div>

        <AssignmentList teamId={teamId} filters={filters} />
      </CardContent>
    </Card>
  );
}
