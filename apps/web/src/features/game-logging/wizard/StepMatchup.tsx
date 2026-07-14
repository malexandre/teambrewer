import type { DeckSummary, TeamMember } from "@teambrewer/shared";

import { Label } from "@/components/ui/label";
import { FormatPicker } from "@/features/decks/FormatPicker";

import { MatchupSubjectPicker } from "./MatchupSubjectPicker";
import type { MatchupSubjectState } from "./matchup-subject";

/**
 * Step 1 — the matchup: the format plus a matchup subject for each side, chosen
 * with the same unified 3-mode picker (team deck / meta deck / hero + label). Your
 * side defaults to a team deck; the opponent (required) defaults to hero + label.
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
  memberOptions,
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
  memberOptions: TeamMember[];
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
        memberOptions={memberOptions}
        metaId={metaId}
      />

      <MatchupSubjectPicker
        teamId={teamId}
        side="opponent"
        state={opponentSubject}
        onChange={setOpponentSubject}
        deckOptions={deckOptions}
        memberOptions={memberOptions}
        metaId={metaId}
      />
    </div>
  );
}
