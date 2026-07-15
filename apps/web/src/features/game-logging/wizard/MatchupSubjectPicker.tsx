import { type PlayerCategory, PLAYER_CATEGORIES, PLAYER_CATEGORY_LABELS } from "@teambrewer/shared";
import type { DeckSummary } from "@teambrewer/shared";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHeroes } from "@/features/cards/use-heroes";
import { HeroPicker } from "@/features/decks/HeroPicker";
import { useIdentityLabel } from "@/features/game-logging/use-game-config";
import { matchupSubjectDisplayName } from "@/features/metas/meta-display";
import { useMetaDeckEntries } from "@/features/metas/use-metas";

import { SELECT_CLASS } from "../game-display";
import { type MatchupSubjectState } from "./matchup-subject";
import { SegmentedControl } from "./SegmentedControl";

/** The sentinel select value that reveals the free-text hero + label sub-form. */
const OTHER_OPTION_VALUE = "other";

/** The select's current value, derived from the subject state (round-trips `onSelect`). */
function selectValueFor(state: MatchupSubjectState): string {
  if (state.mode === "hero_label") {
    return OTHER_OPTION_VALUE;
  }
  if (state.mode === "team_deck") {
    return state.deckId ? `deck:${state.deckId}` : "";
  }
  return state.metaDeckEntryId ? `meta:${state.metaDeckEntryId}` : "";
}

/** Map a chosen select value back to the subject mode + id fields it represents. */
function subjectPatchFromSelectValue(value: string): Partial<MatchupSubjectState> {
  if (value === OTHER_OPTION_VALUE) {
    return { mode: "hero_label" };
  }
  if (value.startsWith("deck:")) {
    return { mode: "team_deck", deckId: value.slice("deck:".length), metaDeckEntryId: "" };
  }
  if (value.startsWith("meta:")) {
    return { mode: "meta_deck", metaDeckEntryId: value.slice("meta:".length), deckId: "" };
  }
  // The placeholder: back to an empty (incomplete) team-deck subject.
  return { mode: "team_deck", deckId: "", metaDeckEntryId: "" };
}

/**
 * The unified matchup-subject picker used for BOTH the self side and the opponent
 * side. A single grouped select offers the team's decks and the meta's decks-to-beat
 * (each shown as its hero · label) under two headings, plus a final **Other** option
 * that reveals a free-text hero + archetype label. A `playerCategory` radio records
 * who piloted the side (teammate / circuit player / other), independent of the subject.
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
  metaId,
  formatId,
}: {
  teamId: string | undefined;
  /** Which side this picker edits — drives the labels. */
  side: "self" | "opponent";
  state: MatchupSubjectState;
  onChange: (next: MatchupSubjectState) => void;
  deckOptions: DeckSummary[];
  /** The meta (if any) whose entries populate the meta-deck options — the most recent of the format. */
  metaId: string | undefined;
  /** The chosen format; narrows the "Other" hero picker to that format's legal heroes. */
  formatId: string | undefined;
}) {
  const identityLabel = useIdentityLabel(teamId);
  const { data: heroesData } = useHeroes(teamId);
  const { data: metaEntriesData } = useMetaDeckEntries(teamId, metaId);
  const heroes = heroesData?.data ?? [];
  const metaEntries = metaEntriesData?.data ?? [];

  const isSelf = side === "self";
  // Neutral side names ("Deck A"/"Deck B") so a game between two players other than
  // the logging member (e.g. a spectated match) reads correctly. They map to the
  // internal A/B sides the rest of the wizard and the model already use.
  const deckSideName = isSelf ? "Deck A" : "Deck B";
  // The self subject select keeps the stable `game-deck` id the e2e drives.
  const subjectSelectId = isSelf ? "game-deck" : "opponent-deck";

  function patch(changes: Partial<MatchupSubjectState>): void {
    onChange({ ...state, ...changes });
  }

  /** The display name of a meta entry: its hero (when resolved) then its label. */
  function metaEntryDisplayName(entry: (typeof metaEntries)[number]): string {
    const heroName = entry.heroId
      ? heroes.find((hero) => hero.id === entry.heroId)?.name
      : undefined;
    return matchupSubjectDisplayName(heroName, entry.label) || entry.opponentSnapshotLabel;
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={subjectSelectId}>{deckSideName}</Label>
        {/* `w-full min-w-0` keeps a long deck name from stretching the select (and its
            flex-column ancestors) past the card; the native select truncates it instead. */}
        <select
          id={subjectSelectId}
          className={`${SELECT_CLASS} w-full min-w-0`}
          value={selectValueFor(state)}
          onChange={(event) => patch(subjectPatchFromSelectValue(event.target.value))}
        >
          <option value="">Select a deck…</option>
          {deckOptions.length > 0 ? (
            <optgroup label="Team decks">
              {deckOptions.map((deck) => {
                // If this team deck is the team's build of a meta deck in the game's
                // meta, mark it so it's easy to identify (per-meta link).
                const linked = deck.linkedMetaEntries.find((link) => link.metaId === metaId);
                return (
                  <option key={deck.id} value={`deck:${deck.id}`}>
                    {deck.name}
                    {linked ? ` — ≈ ${linked.label} (meta)` : ""}
                  </option>
                );
              })}
            </optgroup>
          ) : null}
          {metaEntries.length > 0 ? (
            <optgroup label="Meta decks">
              {metaEntries.map((entry) => (
                <option key={entry.id} value={`meta:${entry.id}`}>
                  {metaEntryDisplayName(entry)}
                </option>
              ))}
            </optgroup>
          ) : null}
          <option value={OTHER_OPTION_VALUE}>Other…</option>
        </select>
      </div>

      {state.mode === "hero_label" ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${side}-hero`}>
              {deckSideName} {identityLabel.toLowerCase()}
            </Label>
            <HeroPicker
              id={`${side}-hero`}
              teamId={teamId}
              formatId={formatId}
              value={state.heroId}
              onChange={(heroId) => patch({ heroId })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${side}-archetype-label`}>
              {deckSideName} archetype label (optional)
            </Label>
            <Input
              id={`${side}-archetype-label`}
              placeholder="e.g. Aggro Red"
              value={state.archetypeLabel}
              onChange={(event) => patch({ archetypeLabel: event.target.value })}
            />
          </div>
        </div>
      ) : null}

      <SegmentedControl<PlayerCategory>
        label={`Who piloted ${deckSideName}?`}
        value={state.playerCategory}
        options={PLAYER_CATEGORIES.map((category) => ({
          value: category,
          label: PLAYER_CATEGORY_LABELS[category],
        }))}
        onChange={(playerCategory) => patch({ playerCategory })}
      />
    </fieldset>
  );
}
