import { ClipboardList } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { mostRecentMetaForFormat, useMetaDeckEntries, useMetas } from "@/features/metas/use-metas";

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
  const { data: metaListData } = useMetas(teamId);
  const meta = mostRecentMetaForFormat(metaListData?.data ?? [], formatId);
  const { data: metaDeckEntryData } = useMetaDeckEntries(teamId, meta?.id);
  const [writing, setWriting] = useState(false);

  const gamePlans = data?.data ?? [];
  const metaDeckEntries = metaDeckEntryData?.data ?? [];
  const metaName = meta?.name ?? null;

  return (
    <Section
      title="Matchup game-plans"
      icon={<ClipboardList />}
      aria-label="Matchup game-plans"
      actions={
        !deckArchived && !writing ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setWriting(true)}>
            Write a game-plan
          </Button>
        ) : null
      }
    >
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
    </Section>
  );
}
