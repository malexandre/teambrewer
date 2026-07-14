import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useCurrentMeta, useMetaDeckEntries } from "@/features/metas/use-metas";

import { GamePlanCard } from "./GamePlanCard";
import { GamePlanEditor } from "./GamePlanEditor";
import { useGamePlans } from "./use-game-plans";

/**
 * The per-deck matchup game-plans, embedded on the deck detail page (the only surface
 * this phase). Lists the deck's plans (each a "vs opponent" card with its body, key
 * cards, and discussion) and offers an inline editor to write a new one. Any member may
 * add a plan unless the deck is archived (matching the server rule that blocks creating
 * against an archived deck).
 */
export function GamePlanSection({
  teamId,
  deckId,
  formatId,
  deckArchived,
}: {
  teamId: string | undefined;
  deckId: string;
  formatId: string;
  deckArchived: boolean;
}) {
  const { data, isPending } = useGamePlans(teamId, { ourDeckId: deckId });
  const { data: currentMeta } = useCurrentMeta(teamId);
  const { data: metaDeckEntryData } = useMetaDeckEntries(teamId, currentMeta?.id);
  const [writing, setWriting] = useState(false);

  const gamePlans = data?.data ?? [];
  const metaDeckEntries = metaDeckEntryData?.data ?? [];
  const metaName = currentMeta?.name ?? null;

  return (
    <section className="flex flex-col gap-3" aria-label="Matchup game-plans">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Matchup game-plans</h3>
        {!deckArchived && !writing ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setWriting(true)}>
            Write a game-plan
          </Button>
        ) : null}
      </div>

      {writing ? (
        <GamePlanEditor
          teamId={teamId}
          deckId={deckId}
          formatId={formatId}
          onDone={() => setWriting(false)}
        />
      ) : null}

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading game-plans…</p>
      ) : gamePlans.length === 0 ? (
        <p className="text-sm text-muted-foreground">No game-plans yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {gamePlans.map((gamePlan) => (
            <GamePlanCard
              key={gamePlan.id}
              teamId={teamId}
              deckId={deckId}
              formatId={formatId}
              gamePlan={gamePlan}
              metaName={metaName}
              metaDeckEntries={metaDeckEntries}
            />
          ))}
        </div>
      )}
    </section>
  );
}
