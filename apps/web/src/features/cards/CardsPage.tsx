import type { CardSummary } from "@teambrewer/shared";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveTeam } from "@/features/teams/active-team";

import { CardDataVersionBadge } from "./CardDataVersionBadge";
import { CardPicker } from "./CardPicker";
import { CardPreview } from "./CardPreview";
import { pitchDisplay } from "./pitch";

/** Browse the active team's game's cards: search, then preview the selected card. */
export function CardsPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const [selected, setSelected] = useState<CardSummary | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cards</CardTitle>
        <CardDataVersionBadge teamId={teamId} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CardPicker teamId={teamId} onSelect={setSelected} />
        {selected ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              Selected: <CardPreview card={selected} />
              {pitchDisplay(selected.pitch) ? (
                <span className="ml-2 text-xs text-muted-foreground">{pitchDisplay(selected.pitch)}</span>
              ) : null}
            </p>
            {selected.imageUrl ? (
              <img src={selected.imageUrl} alt={selected.name} className="w-60 rounded-md border border-border" />
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Search for a card to preview it.</p>
        )}
      </CardContent>
    </Card>
  );
}
