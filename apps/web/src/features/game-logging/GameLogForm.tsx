import {
  type BestOf,
  type ConfidenceFactors,
  type CreateGameLogInput,
  deriveConfidenceWeight,
  type GameLogDetail,
  type GameSide,
  isGameResultConsistent,
  type LossReason,
  lossReasonSchema,
  type WinType,
  winTypeSchema,
} from "@teambrewer/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useDecks } from "@/features/decks/use-decks";
import { FormatPicker } from "@/features/decks/FormatPicker";
import { HeroPicker } from "@/features/decks/HeroPicker";
import { useEvents } from "@/features/events/use-events";
import { useMembers } from "@/features/teams/use-members";
import { ApiError } from "@/lib/api-client";

import {
  DECK_MATURITY_FIELD,
  formatConfidenceWeight,
  LOSS_REASON_LABELS,
  PILOT_FAMILIARITY_FIELD,
  SELECT_CLASS,
  SERIOUSNESS_FIELD,
  SKILL_PARITY_FIELD,
  WIN_TYPE_LABELS,
  type ConfidenceFactorField,
} from "./game-display";
import { useCreateGame, useUpdateGame } from "./use-game-mutations";

/** How the opponent is identified. Drives which opponent sub-control is shown. */
type OpponentKind = "hero" | "teammate" | "archetype" | "reference_deck";

const OPPONENT_KIND_LABELS: Record<OpponentKind, string> = {
  hero: "Opponent hero",
  teammate: "Teammate",
  archetype: "Archetype label",
  reference_deck: "Reference deck",
};

const DEFAULT_FACTORS: ConfidenceFactors = {
  skillParity: "evenly_matched",
  seriousness: "tournament_serious",
  deckMaturity: "both_tuned",
  pilotFamiliarity: "knows_well",
};

/** A row of mutually-exclusive buttons (the segmented-control idiom used across the app). */
function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: { value: Value; label: string }[];
  onChange: (next: Value) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isActive = value === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={isActive ? "default" : "outline"}
              aria-pressed={isActive}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Derive the initial opponent kind + fields from an existing log (edit mode). */
function opponentStateFromLog(gameLog: GameLogDetail | undefined): {
  kind: OpponentKind;
  heroId: string;
  pilotUserId: string;
  teamDeckId: string;
  referenceDeckId: string;
  archetypeLabel: string;
  externalOpponentName: string;
} {
  const sideB = gameLog?.sideB;
  const base = {
    heroId: "",
    pilotUserId: "",
    teamDeckId: "",
    referenceDeckId: "",
    archetypeLabel: "",
    externalOpponentName: sideB?.externalOpponentName ?? "",
  };
  if (!sideB) return { kind: "hero", ...base };
  if (sideB.pilotUserId) {
    return {
      kind: "teammate",
      ...base,
      pilotUserId: sideB.pilotUserId,
      teamDeckId: sideB.deckId ?? "",
    };
  }
  if (sideB.deckId) return { kind: "reference_deck", ...base, referenceDeckId: sideB.deckId };
  if (sideB.heroId) return { kind: "hero", ...base, heroId: sideB.heroId };
  if (sideB.archetypeLabel)
    return { kind: "archetype", ...base, archetypeLabel: sideB.archetypeLabel };
  return { kind: "hero", ...base };
}

/**
 * The fast, mobile-first logging form (the signature UX). Optimized for one-handed
 * use right after a game: pick your deck + opponent, tap the result, and save —
 * confidence factors are pre-filled with their most-trusted defaults so a fast save
 * still yields a meaningful weight. A live "counts as ~0.78" hint (from the same
 * shared derivation the server uses) shows the weight as factors change. Optional
 * details (learnings, tags, event, played-at, pilot) hide behind a disclosure.
 */
export function GameLogForm({
  teamId,
  gameLog,
  onSaved,
  onCancel,
}: {
  teamId: string | undefined;
  gameLog?: GameLogDetail;
  onSaved: (gameLog: GameLogDetail) => void;
  onCancel?: () => void;
}) {
  const isEditing = Boolean(gameLog);
  const { data: currentUser } = useCurrentUser();
  const { data: teamDecks } = useDecks(teamId, {});
  const { data: referenceDecks } = useDecks(teamId, { isReference: true });
  const { data: members } = useMembers(teamId);
  const { data: events } = useEvents(teamId, {});

  const initialOpponent = opponentStateFromLog(gameLog);

  const [formatId, setFormatId] = useState(gameLog?.formatId ?? "");
  const [deckId, setDeckId] = useState(gameLog?.sideA.deckId ?? "");
  const [pilotUserId, setPilotUserId] = useState(gameLog?.sideA.pilotUserId ?? "");
  const [opponentKind, setOpponentKind] = useState<OpponentKind>(initialOpponent.kind);
  const [opponentHeroId, setOpponentHeroId] = useState(initialOpponent.heroId);
  const [opponentPilotUserId, setOpponentPilotUserId] = useState(initialOpponent.pilotUserId);
  const [opponentTeamDeckId, setOpponentTeamDeckId] = useState(initialOpponent.teamDeckId);
  const [opponentReferenceDeckId, setOpponentReferenceDeckId] = useState(
    initialOpponent.referenceDeckId,
  );
  const [archetypeLabel, setArchetypeLabel] = useState(initialOpponent.archetypeLabel);
  const [externalOpponentName, setExternalOpponentName] = useState(
    initialOpponent.externalOpponentName,
  );
  const [firstPlayerSide, setFirstPlayerSide] = useState<GameSide>(gameLog?.firstPlayerSide ?? "A");
  const [bestOf, setBestOf] = useState<BestOf>(gameLog?.bestOf ?? 3);
  const [gamesWonA, setGamesWonA] = useState(gameLog?.result.gamesWonA ?? 2);
  const [gamesWonB, setGamesWonB] = useState(gameLog?.result.gamesWonB ?? 1);
  const [factors, setFactors] = useState<ConfidenceFactors>(
    gameLog?.confidenceFactors ?? DEFAULT_FACTORS,
  );
  const [showDetails, setShowDetails] = useState(false);
  const [learnings, setLearnings] = useState(gameLog?.learnings ?? "");
  const [winType, setWinType] = useState<WinType | "">(gameLog?.winType ?? "");
  const [lossReason, setLossReason] = useState<LossReason | "">(gameLog?.lossReason ?? "");
  const [eventId, setEventId] = useState(gameLog?.eventId ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);

  const createGame = useCreateGame(teamId);
  const updateGame = useUpdateGame(teamId, gameLog?.id ?? "");
  const mutation = isEditing ? updateGame : createGame;

  const effectivePilotUserId = pilotUserId || currentUser?.id || "";
  const previewWeight = deriveConfidenceWeight(factors);

  function setFactor<Value extends string>(
    field: ConfidenceFactorField<Value>,
    value: Value,
  ): void {
    setFactors((current) => ({ ...current, [field.key]: value }));
  }

  /** Best-of-1 records a single Win/Loss/Draw; a match records games won per side. */
  function setSingleGameOutcome(outcome: "win" | "loss" | "draw"): void {
    if (outcome === "win") {
      setGamesWonA(1);
      setGamesWonB(0);
    } else if (outcome === "loss") {
      setGamesWonA(0);
      setGamesWonB(1);
    } else {
      setGamesWonA(0);
      setGamesWonB(0);
    }
  }

  function changeBestOf(next: BestOf): void {
    setBestOf(next);
    // Reset the result to a valid default for the new best-of so the form never
    // sits in an inconsistent state.
    if (next === 1) {
      setGamesWonA(1);
      setGamesWonB(0);
    } else {
      setGamesWonA(Math.ceil(next / 2));
      setGamesWonB(0);
    }
  }

  function buildSideB(): CreateGameLogInput["sideB"] | null {
    const trimmedName = externalOpponentName.trim();
    const externalName = trimmedName.length > 0 ? trimmedName : undefined;
    if (opponentKind === "hero") {
      return opponentHeroId ? { heroId: opponentHeroId, externalOpponentName: externalName } : null;
    }
    if (opponentKind === "teammate") {
      return opponentPilotUserId && opponentTeamDeckId
        ? { pilotUserId: opponentPilotUserId, deckId: opponentTeamDeckId }
        : null;
    }
    if (opponentKind === "reference_deck") {
      return opponentReferenceDeckId
        ? { deckId: opponentReferenceDeckId, externalOpponentName: externalName }
        : null;
    }
    const trimmedLabel = archetypeLabel.trim();
    return trimmedLabel.length > 0
      ? { archetypeLabel: trimmedLabel, externalOpponentName: externalName }
      : null;
  }

  function submit(formEvent: React.FormEvent): void {
    formEvent.preventDefault();
    setValidationError(null);

    if (!formatId) {
      setValidationError("Pick the format the game was played in.");
      return;
    }
    if (!deckId) {
      setValidationError("Pick the deck you played.");
      return;
    }
    if (!effectivePilotUserId) {
      setValidationError("Pick who piloted our deck.");
      return;
    }
    const sideB = buildSideB();
    if (!sideB) {
      setValidationError("Identify the opponent.");
      return;
    }
    const result = { gamesWonA, gamesWonB };
    if (!isGameResultConsistent(bestOf, result)) {
      setValidationError("The result is not consistent with the best-of.");
      return;
    }

    const payload: CreateGameLogInput = {
      formatId,
      sideA: { pilotUserId: effectivePilotUserId, deckId },
      sideB,
      firstPlayerSide,
      bestOf,
      result,
      confidenceFactors: factors,
      learnings,
      ...(eventId ? { eventId } : {}),
      ...(winType ? { winType } : {}),
      ...(lossReason ? { lossReason } : {}),
    };

    mutation.mutate(payload, { onSuccess: onSaved });
  }

  const deckOptions = teamDecks?.data ?? [];
  const referenceDeckOptions = referenceDecks?.data ?? [];
  const memberOptions = members?.data ?? [];
  const eventOptions = events?.data ?? [];
  const winThreshold = Math.ceil(bestOf / 2);

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
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
          {(Object.keys(OPPONENT_KIND_LABELS) as OpponentKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {OPPONENT_KIND_LABELS[kind]}
            </option>
          ))}
        </select>

        {opponentKind === "hero" ? (
          <HeroPicker teamId={teamId} value={opponentHeroId} onChange={setOpponentHeroId} />
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

        {opponentKind === "reference_deck" ? (
          <select
            className={SELECT_CLASS}
            value={opponentReferenceDeckId}
            onChange={(event) => setOpponentReferenceDeckId(event.target.value)}
            aria-label="Reference deck"
          >
            <option value="">Select a reference deck…</option>
            {referenceDeckOptions.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        ) : null}

        {opponentKind === "archetype" ? (
          <Input
            aria-label="Archetype label"
            placeholder="e.g. Aggro Red"
            value={archetypeLabel}
            onChange={(event) => setArchetypeLabel(event.target.value)}
          />
        ) : null}
      </div>

      <SegmentedControl<GameSide>
        label="Who went first?"
        value={firstPlayerSide}
        options={[
          { value: "A", label: "Me" },
          { value: "B", label: "Opponent" },
        ]}
        onChange={setFirstPlayerSide}
      />

      <SegmentedControl<string>
        label="Best of"
        value={String(bestOf)}
        options={[
          { value: "1", label: "Single game" },
          { value: "3", label: "Best of 3" },
          { value: "5", label: "Best of 5" },
        ]}
        onChange={(next) => changeBestOf(Number(next) as BestOf)}
      />

      {bestOf === 1 ? (
        <SegmentedControl<string>
          label="Result"
          value={gamesWonA > gamesWonB ? "win" : gamesWonA < gamesWonB ? "loss" : "draw"}
          options={[
            { value: "win", label: "Win" },
            { value: "loss", label: "Loss" },
            { value: "draw", label: "Draw" },
          ]}
          onChange={(next) => setSingleGameOutcome(next as "win" | "loss" | "draw")}
        />
      ) : (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm font-medium">Games won</legend>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              You
              <Input
                type="number"
                className="w-20"
                min={0}
                max={winThreshold}
                value={gamesWonA}
                onChange={(event) => setGamesWonA(Number(event.target.value))}
                aria-label="Games you won"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              Them
              <Input
                type="number"
                className="w-20"
                min={0}
                max={winThreshold}
                value={gamesWonB}
                onChange={(event) => setGamesWonB(Number(event.target.value))}
                aria-label="Games they won"
              />
            </label>
          </div>
        </fieldset>
      )}

      <section className="flex flex-col gap-3 rounded-md border border-border p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Confidence factors</h3>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            Counts as ~{formatConfidenceWeight(previewWeight)}
          </span>
        </div>
        <SegmentedControl
          label={SKILL_PARITY_FIELD.label}
          value={factors.skillParity}
          options={SKILL_PARITY_FIELD.options}
          onChange={(value) => setFactor(SKILL_PARITY_FIELD, value)}
        />
        <SegmentedControl
          label={SERIOUSNESS_FIELD.label}
          value={factors.seriousness}
          options={SERIOUSNESS_FIELD.options}
          onChange={(value) => setFactor(SERIOUSNESS_FIELD, value)}
        />
        <SegmentedControl
          label={DECK_MATURITY_FIELD.label}
          value={factors.deckMaturity}
          options={DECK_MATURITY_FIELD.options}
          onChange={(value) => setFactor(DECK_MATURITY_FIELD, value)}
        />
        <SegmentedControl
          label={PILOT_FAMILIARITY_FIELD.label}
          value={factors.pilotFamiliarity}
          options={PILOT_FAMILIARITY_FIELD.options}
          onChange={(value) => setFactor(PILOT_FAMILIARITY_FIELD, value)}
        />
      </section>

      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails((open) => !open)}
        >
          {showDetails ? "Hide details" : "More details"}
        </Button>
      </div>

      {showDetails ? (
        <div className="flex flex-col gap-4 rounded-md border border-border p-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="game-pilot">Pilot (defaults to you)</Label>
            <select
              id="game-pilot"
              className={SELECT_CLASS}
              value={effectivePilotUserId}
              onChange={(event) => setPilotUserId(event.target.value)}
            >
              {memberOptions.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </div>

          {opponentKind !== "teammate" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="game-opponent-name">Opponent name (optional)</Label>
              <Input
                id="game-opponent-name"
                placeholder="Who did you play against?"
                value={externalOpponentName}
                onChange={(event) => setExternalOpponentName(event.target.value)}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <Label htmlFor="game-event">Event (optional)</Label>
            <select
              id="game-event"
              className={SELECT_CLASS}
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
            >
              <option value="">No event</option>
              {eventOptions.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="game-win-type">Win type (optional)</Label>
            <select
              id="game-win-type"
              className={SELECT_CLASS}
              value={winType}
              onChange={(event) => setWinType(event.target.value as WinType | "")}
            >
              <option value="">—</option>
              {winTypeSchema.options.map((option) => (
                <option key={option} value={option}>
                  {WIN_TYPE_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="game-loss-reason">Loss reason (optional)</Label>
            <select
              id="game-loss-reason"
              className={SELECT_CLASS}
              value={lossReason}
              onChange={(event) => setLossReason(event.target.value as LossReason | "")}
            >
              <option value="">—</option>
              {lossReasonSchema.options.map((option) => (
                <option key={option} value={option}>
                  {LOSS_REASON_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="game-learnings">Learnings (optional)</Label>
            <textarea
              id="game-learnings"
              className="min-h-20 rounded-md border border-input bg-background px-2 py-1 text-sm"
              value={learnings}
              onChange={(event) => setLearnings(event.target.value)}
              placeholder="What did this game teach the team?"
            />
          </div>
        </div>
      ) : null}

      {validationError ? (
        <p role="alert" className="text-sm text-destructive">
          {validationError}
        </p>
      ) : null}

      {mutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error instanceof ApiError ? mutation.error.message : "Could not save the game."}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending}>
          {isEditing ? "Save changes" : "Log game"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
