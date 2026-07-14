import type { DeckSummary } from "@teambrewer/shared";

import { Label } from "@/components/ui/label";
import { FormatPicker } from "@/features/decks/FormatPicker";

import { MatchupSubjectPicker } from "./MatchupSubjectPicker";
import type { MatchupSubjectState } from "./matchup-subject";

/**
 * Step 1 — the matchup: the format plus a matchup subject for each side, chosen
 * with the same unified picker (one grouped select over team + meta decks, or
 * Other). Your side defaults to a team deck; the opponent (required) defaults to
 * the Other (hero + label) mode.
 */
export function StepMatchup({
  teamId,
  formatId,
  setFormatId,
  selfSubject,
  setSelfSubject,
  opponentSubject,
  setOpponentSubject,
  deckOptions,
  metaId,
}: {
  teamId: string | undefined;
  formatId: string;
  setFormatId: (formatId: string) => void;
  selfSubject: MatchupSubjectState;
  setSelfSubject: (next: MatchupSubjectState) => void;
  opponentSubject: MatchupSubjectState;
  setOpponentSubject: (next: MatchupSubjectState) => void;
  deckOptions: DeckSummary[];
  metaId: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Label htmlFor="game-format">Format</Label>
        <FormatPicker teamId={teamId} value={formatId} onChange={setFormatId} id="game-format" />
      </div>

      <MatchupSubjectPicker
        teamId={teamId}
        side="self"
        state={selfSubject}
        onChange={setSelfSubject}
        deckOptions={deckOptions}
        metaId={metaId}
      />

      <MatchupSubjectPicker
        teamId={teamId}
        side="opponent"
        state={opponentSubject}
        onChange={setOpponentSubject}
        deckOptions={deckOptions}
        metaId={metaId}
      />
    </div>
  );
}
