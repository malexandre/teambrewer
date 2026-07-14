import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";

import { GameLogWizard } from "./GameLogWizard";
import { useGame } from "./use-games";

/**
 * A focused, mobile-first full-screen shell for the game-logging wizard, kept on its
 * own route rather than squeezed onto the games list. A single narrow column so the
 * form reads well on a phone right after playing, with a back link that always leads
 * somewhere sane.
 */
function GameLogShell({
  back,
  title,
  children,
}: {
  back: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title={title} backSlot={back} />
      <Section>{children}</Section>
    </div>
  );
}

/** Create route (`/games/new`): a blank wizard; on save, go to the new log's detail. */
export function NewGameLogPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const navigate = useNavigate();

  return (
    <GameLogShell
      title="Log a game"
      back={
        <Link to="/games" className="text-sm text-muted-foreground hover:underline">
          ← Back to games
        </Link>
      }
    >
      <GameLogWizard
        teamId={teamId}
        onSaved={(game) =>
          void navigate({ to: "/games/$gameLogId", params: { gameLogId: game.id } })
        }
        onCancel={() => void navigate({ to: "/games" })}
      />
    </GameLogShell>
  );
}

/** Edit route (`/games/$gameLogId/edit`): loads the log, then seeds the wizard from it. */
export function EditGameLogPage({ gameLogId }: { gameLogId: string }) {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const navigate = useNavigate();
  const { data: game, isPending, error } = useGame(teamId, gameLogId);

  const goToDetail = () => void navigate({ to: "/games/$gameLogId", params: { gameLogId } });

  return (
    <GameLogShell
      title="Edit game"
      back={
        <Link
          to="/games/$gameLogId"
          params={{ gameLogId }}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to game
        </Link>
      }
    >
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading game…</p>
      ) : error ? (
        <p className="text-sm text-destructive">
          {error instanceof ApiError && error.status === 404
            ? "This game does not exist or is not visible to you."
            : "Could not load this game."}
        </p>
      ) : game ? (
        <GameLogWizard teamId={teamId} gameLog={game} onSaved={goToDetail} onCancel={goToDetail} />
      ) : null}
    </GameLogShell>
  );
}
