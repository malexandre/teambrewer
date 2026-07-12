import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { useActiveTeam } from "./active-team";
import { useMembers } from "./use-members";

/**
 * The active team's roster. This is the phase-01 stand-in for "team data": it is
 * fetched with the active `X-Team-Id`, so it visibly changes when the user
 * switches teams and never shows another team's members.
 */
export function MembersPanel() {
  const { activeTeam } = useActiveTeam();
  const { data, isPending, isError } = useMembers(activeTeam?.teamId);

  if (!activeTeam) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No team yet</CardTitle>
          <CardDescription>Ask an admin to add you to a team.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{activeTeam.name}</CardTitle>
        <CardDescription>Members of the active team ({activeTeam.gameId}).</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading members…</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Could not load this team's members.</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="members-list">
            {data.data.map((member) => (
              <li key={member.userId} className="flex items-center justify-between py-2 text-sm">
                <span>{member.displayName}</span>
                <span className="text-muted-foreground">{member.role}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
