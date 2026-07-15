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
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor="game-format">Format</Label>
        <FormatPicker teamId={teamId} value={formatId} onChange={setFormatId} id="game-format" />
      </div>

      {/* The two sides as blue (Deck A) / red (Deck B) panels with a fighting-game "VS"
          badge straddling the seam — the colour is the side cue that carries into step 2. */}
      <div className="relative flex min-w-0 flex-col gap-3">
        <MatchupSubjectPicker
          teamId={teamId}
          side="self"
          state={selfSubject}
          onChange={setSelfSubject}
          deckOptions={deckOptions}
          metaId={metaId}
          formatId={formatId || undefined}
        />

        <div className="pointer-events-none flex justify-center" aria-hidden="true">
          <span className="relative z-10 -my-5 flex size-10 items-center justify-center rounded-full border text-sm font-black italic shadow-sm select-none [background-image:linear-gradient(135deg,var(--color-info)_50%,var(--color-danger)_50%)]">
            VS
          </span>
        </div>

        <MatchupSubjectPicker
          teamId={teamId}
          side="opponent"
          state={opponentSubject}
          onChange={setOpponentSubject}
          deckOptions={deckOptions}
          metaId={metaId}
          formatId={formatId || undefined}
        />
      </div>
    </div>
  );
}
