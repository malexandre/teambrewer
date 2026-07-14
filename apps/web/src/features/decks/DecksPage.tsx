import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Decks"
        actions={
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            New deck
          </Button>
        }
      />
      <Section aria-label="Decks">
        <DeckList teamId={teamId} />
      </Section>

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
    </div>
  );
}
