import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { useActiveTeam } from "@/features/teams/active-team";

import { GameList } from "./GameList";

/** The team's game logs: browse/filter the list; logging a game opens its own route. */
export function GamesPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Games"
        actions={
          <Button size="sm" onClick={() => void navigate({ to: "/games/new" })}>
            Log a game
          </Button>
        }
      />
      <Section aria-label="Games">
        <GameList teamId={teamId} />
      </Section>
    </div>
  );
}
