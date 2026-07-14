import type { DeckSummary, TeamMember } from "@teambrewer/shared";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormatPicker } from "@/features/decks/FormatPicker";
import { HeroPicker } from "@/features/decks/HeroPicker";
import { useIdentityLabel } from "@/features/game-logging/use-game-config";

import { SELECT_CLASS } from "../game-display";
import { OPPONENT_KIND_LABELS, type OpponentKind } from "./opponent";

/** Step 1 — the matchup: format, our deck, and how the opponent is identified. */
export function StepMatchup({
  teamId,
  formatId,
  setFormatId,
  deckId,
  setDeckId,
  deckOptions,
  memberOptions,
  opponentKind,
  setOpponentKind,
  opponentHeroId,
  setOpponentHeroId,
  opponentPilotUserId,
  setOpponentPilotUserId,
  opponentTeamDeckId,
  setOpponentTeamDeckId,
  opponentDeckId,
  setOpponentDeckId,
  archetypeLabel,
  setArchetypeLabel,
}: {
  teamId: string | undefined;
  formatId: string;
  setFormatId: (formatId: string) => void;
  deckId: string;
  setDeckId: (deckId: string) => void;
  deckOptions: DeckSummary[];
  memberOptions: TeamMember[];
  opponentKind: OpponentKind;
  setOpponentKind: (kind: OpponentKind) => void;
  opponentHeroId: string;
  setOpponentHeroId: (heroId: string) => void;
  opponentPilotUserId: string;
  setOpponentPilotUserId: (userId: string) => void;
  opponentTeamDeckId: string;
  setOpponentTeamDeckId: (deckId: string) => void;
  opponentDeckId: string;
  setOpponentDeckId: (deckId: string) => void;
  archetypeLabel: string;
  setArchetypeLabel: (label: string) => void;
}) {
  const identityLabel = useIdentityLabel(teamId);
  const opponentKindLabels = OPPONENT_KIND_LABELS;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Label htmlFor="game-format">Format</Label>
        <FormatPicker teamId={teamId} value={formatId} onChange={setFormatId} id="game-format" />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="game-deck">Your deck</Label>
        <select
          id="game-deck"
          className={SELECT_CLASS}
          value={deckId}
          onChange={(event) => setDeckId(event.target.value)}
        >
          <option value="">Select your deck…</option>
          {deckOptions.map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="opponent-kind">Opponent</Label>
        <select
          id="opponent-kind"
          className={SELECT_CLASS}
          value={opponentKind}
          onChange={(event) => setOpponentKind(event.target.value as OpponentKind)}
          aria-label="Opponent kind"
        >
          {(Object.keys(opponentKindLabels) as OpponentKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {opponentKindLabels[kind]}
            </option>
          ))}
        </select>

        {opponentKind === "archetype" ? (
          <div className="flex flex-col gap-2">
            <Input
              aria-label="Archetype label"
              placeholder="e.g. Aggro Red"
              value={archetypeLabel}
              onChange={(event) => setArchetypeLabel(event.target.value)}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="opponent-hero">
                Opponent {identityLabel.toLowerCase()} (optional)
              </Label>
              <HeroPicker
                id="opponent-hero"
                teamId={teamId}
                value={opponentHeroId}
                onChange={setOpponentHeroId}
              />
            </div>
          </div>
        ) : null}

        {opponentKind === "teammate" ? (
          <div className="flex flex-col gap-2">
            <select
              className={SELECT_CLASS}
              value={opponentPilotUserId}
              onChange={(event) => setOpponentPilotUserId(event.target.value)}
              aria-label="Teammate pilot"
            >
              <option value="">Select the teammate…</option>
              {memberOptions.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
            <select
              className={SELECT_CLASS}
              value={opponentTeamDeckId}
              onChange={(event) => setOpponentTeamDeckId(event.target.value)}
              aria-label="Teammate deck"
            >
              <option value="">Select their deck…</option>
              {deckOptions.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {opponentKind === "team_deck" ? (
          <select
            className={SELECT_CLASS}
            value={opponentDeckId}
            onChange={(event) => setOpponentDeckId(event.target.value)}
            aria-label="Opponent team deck"
          >
            <option value="">Select a team deck…</option>
            {deckOptions.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  );
}
