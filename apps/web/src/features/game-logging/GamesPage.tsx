import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveTeam } from "@/features/teams/active-team";

import { GameList } from "./GameList";
import { GameLogWizard } from "./GameLogWizard";

/** The team's game logs: browse/filter the list and log a new game. */
export function GamesPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const navigate = useNavigate();
  const [logging, setLogging] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Games</CardTitle>
          <Button size="sm" onClick={() => setLogging((open) => !open)}>
            {logging ? "Close" : "Log a game"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {logging ? (
          <GameLogWizard
            teamId={teamId}
            onSaved={(game) => {
              setLogging(false);
              void navigate({ to: "/games/$gameLogId", params: { gameLogId: game.id } });
            }}
            onCancel={() => setLogging(false)}
          />
        ) : null}
        <GameList teamId={teamId} />
      </CardContent>
    </Card>
  );
}
