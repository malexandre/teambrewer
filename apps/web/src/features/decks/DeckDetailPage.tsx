import { Link } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveTeam } from "@/features/teams/active-team";
import { ApiError } from "@/lib/api-client";

import { DeckDetail } from "./DeckDetail";
import { useDeck } from "./use-decks";

/** Detail route for a single deck; renders 404-safe states around {@link DeckDetail}. */
export function DeckDetailPage({ deckId }: { deckId: string }) {
  const { activeTeam } = useActiveTeam();
  const teamId = activeTeam?.teamId;
  const { data: deck, isPending, error } = useDeck(teamId, deckId);

  return (
    <Card>
      <CardHeader>
        <Link to="/decks" className="text-sm text-muted-foreground hover:underline">
          ← Back to decks
        </Link>
        <CardTitle className="sr-only">Deck</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="text-sm text-muted-foreground">Loading deck…</p>
        ) : error ? (
          <p className="text-sm text-destructive">
            {error instanceof ApiError && error.status === 404
              ? "This deck does not exist or is not visible to you."
              : "Could not load this deck."}
          </p>
        ) : deck ? (
          <DeckDetail teamId={teamId} deck={deck} />
        ) : null}
      </CardContent>
    </Card>
  );
}
