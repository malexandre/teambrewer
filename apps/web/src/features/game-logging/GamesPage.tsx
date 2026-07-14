import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveTeam } from "@/features/teams/active-team";

import { GameList } from "./GameList";

/** The team's game logs: browse/filter the list; logging a game opens its own route. */
export function GamesPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Games</CardTitle>
          <Button size="sm" onClick={() => void navigate({ to: "/games/new" })}>
            Log a game
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <GameList teamId={teamId} />
      </CardContent>
    </Card>
  );
}
