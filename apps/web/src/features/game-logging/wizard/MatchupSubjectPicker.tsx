import { type DeckSummary, META_TIER_LABELS, type TeamMember } from "@teambrewer/shared";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHeroes } from "@/features/cards/use-heroes";
import { HeroPicker } from "@/features/decks/HeroPicker";
import { useIdentityLabel } from "@/features/game-logging/use-game-config";
import { useMetaDeckEntries } from "@/features/metas/use-metas";

import { SELECT_CLASS } from "../game-display";
import {
  MATCHUP_SUBJECT_MODE_LABELS,
  MATCHUP_SUBJECT_MODES,
  type MatchupSubjectMode,
  type MatchupSubjectState,
} from "./matchup-subject";
import { SegmentedControl } from "./SegmentedControl";

/**
 * The unified 3-mode matchup-subject picker used for BOTH the self side and the
 * opponent side. A mode toggle selects between a **team deck**, a **meta deck**
 * (entries of the current meta, shown with their tier), or a free-text **hero +
 * label**; the matching sub-control edits the chosen subject. An optional pilot
 * (and, for the opponent, an optional external name) sits alongside, independent of
 * the subject — naming a teammate never forces a team deck (R-1).
 *
 * The component is fully controlled: it owns no state, emitting every change through
 * `onChange` so the wizard container keeps the single source of truth and nothing is
 * lost when stepping back and forth.
 */
export function MatchupSubjectPicker({
  teamId,
  side,
  state,
  onChange,
  deckOptions,
  memberOptions,
  currentMetaId,
}: {
  teamId: string | undefined;
  /** Which side this picker edits — drives the labels and the opponent-only extras. */
  side: "self" | "opponent";
  state: MatchupSubjectState;
  onChange: (next: MatchupSubjectState) => void;
  deckOptions: DeckSummary[];
  memberOptions: TeamMember[];
  /** The current meta (if any) whose entries populate the meta-deck mode. */
  currentMetaId: string | undefined;
}) {
  const identityLabel = useIdentityLabel(teamId);
  const { data: heroesData } = useHeroes(teamId);
  const { data: metaEntriesData } = useMetaDeckEntries(teamId, currentMetaId);
  const heroes = heroesData?.data ?? [];
  const metaEntries = metaEntriesData?.data ?? [];

  const isSelf = side === "self";
  const heading = isSelf ? "Your side" : "Opponent";
  // The self team-deck select keeps the stable `game-deck` id the e2e drives.
  const teamDeckSelectId = isSelf ? "game-deck" : "opponent-team-deck";

  function patch(changes: Partial<MatchupSubjectState>): void {
    onChange({ ...state, ...changes });
  }

  function changeMode(mode: MatchupSubjectMode): void {
    patch({ mode });
  }

  /**
   * Selecting a hero pre-fills the archetype label with the hero's name when the
   * label is still empty, so picking a hero alone yields a valid subject (the label
   * stays freely editable).
   */
  function changeHero(heroId: string): void {
    const hero = heroes.find((candidate) => candidate.id === heroId);
    const archetypeLabel =
      state.archetypeLabel.trim().length === 0 && hero ? hero.name : state.archetypeLabel;
    patch({ heroId, archetypeLabel });
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">{heading}</legend>

      <SegmentedControl<MatchupSubjectMode>
        label={isSelf ? "How to identify your side" : "How to identify the opponent"}
        value={state.mode}
        options={MATCHUP_SUBJECT_MODES.map((mode) => ({
          value: mode,
          label: MATCHUP_SUBJECT_MODE_LABELS[mode],
        }))}
        onChange={changeMode}
      />

      {state.mode === "team_deck" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={teamDeckSelectId}>{isSelf ? "Your deck" : "Opponent team deck"}</Label>
          <select
            id={teamDeckSelectId}
            className={SELECT_CLASS}
            value={state.deckId}
            onChange={(event) => patch({ deckId: event.target.value })}
          >
            <option value="">Select a team deck…</option>
            {deckOptions.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {state.mode === "meta_deck" ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${side}-meta-entry`}>
            {isSelf ? "Your meta deck" : "Opponent meta deck"}
          </Label>
          <select
            id={`${side}-meta-entry`}
            className={SELECT_CLASS}
            value={state.metaDeckEntryId}
            onChange={(event) => patch({ metaDeckEntryId: event.target.value })}
          >
            <option value="">Select a meta deck…</option>
            {metaEntries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label} · {META_TIER_LABELS[entry.tier]}
              </option>
            ))}
          </select>
          {currentMetaId && metaEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              The current meta has no decks to beat yet.
            </p>
          ) : null}
          {!currentMetaId ? (
            <p className="text-xs text-muted-foreground">There is no current meta to pick from.</p>
          ) : null}
        </div>
      ) : null}

      {state.mode === "hero_label" ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${side}-archetype-label`}>
              {isSelf ? "Your archetype label" : "Opponent archetype label"}
            </Label>
            <Input
              id={`${side}-archetype-label`}
              placeholder="e.g. Aggro Red"
              value={state.archetypeLabel}
              onChange={(event) => patch({ archetypeLabel: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${side}-hero`}>
              {isSelf ? "Your" : "Opponent"} {identityLabel.toLowerCase()} (optional)
            </Label>
            <HeroPicker
              id={`${side}-hero`}
              teamId={teamId}
              value={state.heroId}
              onChange={changeHero}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${side}-pilot`}>
          {isSelf ? "Pilot (optional, defaults to you)" : "Teammate who piloted it (optional)"}
        </Label>
        <select
          id={`${side}-pilot`}
          className={SELECT_CLASS}
          value={state.pilotUserId}
          onChange={(event) => patch({ pilotUserId: event.target.value })}
        >
          <option value="">{isSelf ? "— No pilot —" : "— No teammate —"}</option>
          {memberOptions.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.displayName}
            </option>
          ))}
        </select>
      </div>

      {!isSelf ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="opponent-external-name">Opponent name (optional)</Label>
          <Input
            id="opponent-external-name"
            placeholder="Who did you play against?"
            value={state.externalOpponentName}
            onChange={(event) => patch({ externalOpponentName: event.target.value })}
          />
        </div>
      ) : null}
    </fieldset>
  );
}
