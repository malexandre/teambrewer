import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveTeam } from "@/features/teams/active-team";

import { DeckForm } from "./DeckForm";
import { DeckList } from "./DeckList";

/** The team's decks: browse/filter the list and create a new deck. */
export function DecksPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Decks</CardTitle>
          <Button size="sm" onClick={() => setCreating((open) => !open)}>
            {creating ? "Close" : "New deck"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {creating ? (
          <DeckForm
            teamId={teamId}
            onSaved={(deck) => {
              setCreating(false);
              void navigate({ to: "/decks/$deckId", params: { deckId: deck.id } });
            }}
            onCancel={() => setCreating(false)}
          />
        ) : null}
        <DeckList teamId={teamId} />
      </CardContent>
    </Card>
  );
}
