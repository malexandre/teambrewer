import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { useActiveTeam } from "@/features/teams/active-team";

import { DeckForm } from "./DeckForm";
import { DeckList } from "./DeckList";

/** The team's decks: browse/filter the list and create a new deck in a modal. */
export function DecksPage() {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const navigate = useNavigate();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Decks</CardTitle>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            New deck
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <DeckList teamId={teamId} />
      </CardContent>

      <Dialog open={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="New deck">
        <DeckForm
          teamId={teamId}
          onSaved={(deck) => {
            setIsCreateOpen(false);
            void navigate({ to: "/decks/$deckId", params: { deckId: deck.id } });
          }}
          onCancel={() => setIsCreateOpen(false)}
        />
      </Dialog>
    </Card>
  );
}
