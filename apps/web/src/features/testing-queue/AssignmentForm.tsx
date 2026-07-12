import type { CreateTestAssignmentInput } from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeroPicker } from "@/features/decks/HeroPicker";
import { useDecks } from "@/features/decks/use-decks";
import { useMembers } from "@/features/teams/use-members";
import { ApiError } from "@/lib/api-client";

import { SELECT_CLASS } from "./testing-queue-display";
import { useCreateAssignment } from "./use-assignment-mutations";

type OpponentKind = "hero" | "archetype";

/**
 * Assign a matchup: pick the assignee and one of our decks, name the opponent (a
 * bare hero or a free-text archetype label), and optionally set a target game count.
 * Gauntlet-entry-targeted assignments come from the coverage tracker (phase-07). The
 * form closes on success.
 */
export function AssignmentForm({
  teamId,
  onDone,
}: {
  teamId: string | undefined;
  onDone: () => void;
}) {
  const { data: memberData } = useMembers(teamId);
  const { data: deckData } = useDecks(teamId);
  const createAssignment = useCreateAssignment(teamId);

  const members = memberData?.data ?? [];
  const decks = deckData?.data ?? [];

  const [assigneeId, setAssigneeId] = useState("");
  const [deckId, setDeckId] = useState("");
  const [opponentKind, setOpponentKind] = useState<OpponentKind>("hero");
  const [opponentHeroId, setOpponentHeroId] = useState("");
  const [opponentArchetypeLabel, setOpponentArchetypeLabel] = useState("");
  const [targetGames, setTargetGames] = useState("");

  const opponentReady =
    opponentKind === "hero" ? opponentHeroId !== "" : opponentArchetypeLabel.trim().length > 0;
  const canSubmit =
    assigneeId !== "" && deckId !== "" && opponentReady && !createAssignment.isPending;

  function submit() {
    const opponent =
      opponentKind === "hero"
        ? { opponentHeroId }
        : { opponentArchetypeLabel: opponentArchetypeLabel.trim() };
    const parsedTarget = Number.parseInt(targetGames, 10);
    const input: CreateTestAssignmentInput = {
      assigneeId,
      deckId,
      notes: "",
      ...opponent,
      ...(Number.isInteger(parsedTarget) && parsedTarget > 0 ? { targetGames: parsedTarget } : {}),
    };
    createAssignment.mutate(input, {
      onSuccess: () => {
        setAssigneeId("");
        setDeckId("");
        setOpponentHeroId("");
        setOpponentArchetypeLabel("");
        setTargetGames("");
        onDone();
      },
    });
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-input p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Assignee</span>
        <select
          className={SELECT_CLASS}
          aria-label="Assignee"
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
        >
          <option value="">— Choose a teammate —</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Our deck</span>
        <select
          className={SELECT_CLASS}
          aria-label="Our deck"
          value={deckId}
          onChange={(event) => setDeckId(event.target.value)}
        >
          <option value="">— Choose a deck —</option>
          {decks.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium">Opponent</legend>
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="opponentKind"
              checked={opponentKind === "hero"}
              onChange={() => setOpponentKind("hero")}
            />
            Hero
          </label>
          <label className="flex items-center gap-1">
            <input
              type="radio"
              name="opponentKind"
              checked={opponentKind === "archetype"}
              onChange={() => setOpponentKind("archetype")}
            />
            Archetype label
          </label>
        </div>
        {opponentKind === "hero" ? (
          <HeroPicker teamId={teamId} value={opponentHeroId} onChange={setOpponentHeroId} />
        ) : (
          <Input
            aria-label="Archetype label"
            value={opponentArchetypeLabel}
            onChange={(event) => setOpponentArchetypeLabel(event.target.value)}
            placeholder="e.g. Aggro Draconic"
          />
        )}
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">Target games (optional)</span>
        <Input
          type="number"
          min={1}
          aria-label="Target games"
          value={targetGames}
          onChange={(event) => setTargetGames(event.target.value)}
          placeholder="e.g. 10"
        />
      </label>

      {createAssignment.isError ? (
        <p className="text-sm text-destructive" role="alert">
          {createAssignment.error instanceof ApiError
            ? createAssignment.error.message
            : "Could not create the assignment."}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          Assign
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
