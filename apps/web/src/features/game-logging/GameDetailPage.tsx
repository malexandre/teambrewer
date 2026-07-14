import { Link } from "@tanstack/react-router";

import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";

import { GameDetail } from "./GameDetail";
import { useGame } from "./use-games";

/** Detail route for a single game log; renders 404-safe states around {@link GameDetail}. */
export function GameDetailPage({ gameLogId }: { gameLogId: string }) {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const { data: game, isPending, error } = useGame(teamId, gameLogId);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/games" className="text-sm text-muted-foreground hover:underline">
        ← Back to games
      </Link>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading game…</p>
      ) : error ? (
        <p className="text-sm text-destructive">
          {error instanceof ApiError && error.status === 404
            ? "This game does not exist or is not visible to you."
            : "Could not load this game."}
        </p>
      ) : game ? (
        <GameDetail teamId={teamId} game={game} />
      ) : null}
    </div>
  );
}
