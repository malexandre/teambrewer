import {
  type BestOf,
  type CardSummary,
  type ConfidenceFactors,
  type CreateGameLogInput,
  deriveConfidenceWeight,
  type GameLogCardInput,
  type GameLogDetail,
  type GameSide,
  isGameResultConsistent,
  type LossReason,
  type WinType,
} from "@teambrewer/shared";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useDecks } from "@/features/decks/use-decks";
import { useCurrentMeta, useMetas } from "@/features/metas/use-metas";
import { useMembers } from "@/features/teams/use-members";
import { ApiError } from "@/lib/api-client";

import { type ConfidenceFactorField } from "./game-display";
import { useGameConfig } from "./use-game-config";
import { useCreateGame, useUpdateGame } from "./use-game-mutations";
import {
  buildSideAInput,
  buildSideBInput,
  isSubjectComplete,
  type MatchupSubjectState,
  subjectStateFromSideA,
  subjectStateFromSideB,
} from "./wizard/matchup-subject";
import { StepConfidence } from "./wizard/StepConfidence";
import { StepMatchup } from "./wizard/StepMatchup";
import { StepNotes } from "./wizard/StepNotes";
import { StepResult } from "./wizard/StepResult";
import { WizardProgress } from "./wizard/WizardProgress";

/** The confidence factors that yield the maximum weight — the fast-path default. */
const DEFAULT_FACTORS: ConfidenceFactors = {
  skillParity: "evenly_matched",
  seriousness: "tournament_serious",
  deckMaturity: "both_tuned",
  pilotFamiliarity: "knows_well",
};

/** Best-of used before the game-config query resolves (and when no config is available). */
const FALLBACK_BEST_OF: BestOf = 3;

/**
 * The mobile-first game-logging wizard (the signature UX). It splits the log into
 * short steps — matchup, result, confidence — so the fast path is three taps + Log
 * game, with an optional fourth step for notes and impressive/underperforming card
 * capture. Both sides of the matchup are chosen with the same unified 3-mode subject
 * picker (team deck / meta deck / hero + label). The container owns every piece of
 * state and threads it into the steps, so stepping back and forth never loses input.
 */
export function GameLogWizard({
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
  const { data: gameConfig } = useGameConfig(teamId);
  const { data: teamDecks } = useDecks(teamId, {});
  const { data: members } = useMembers(teamId);
  const { data: metas } = useMetas(teamId);
  const { data: currentMeta, isPending: currentMetaPending } = useCurrentMeta(teamId);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  // On edit, expand the optional notes/cards step up front when the log already
  // carries any of its fields, so nothing captured is hidden behind "Add notes &
  // cards". In create mode it always starts collapsed for the three-tap fast path.
  const [showNotes, setShowNotes] = useState(() =>
    gameLog
      ? gameLog.impressiveCards.length > 0 ||
        gameLog.underperformingCards.length > 0 ||
        gameLog.learnings.trim().length > 0 ||
        Boolean(gameLog.winType) ||
        Boolean(gameLog.lossReason)
      : false,
  );

  const [formatId, setFormatId] = useState(gameLog?.formatId ?? "");
  const [selfSubject, setSelfSubject] = useState<MatchupSubjectState>(() =>
    subjectStateFromSideA(gameLog?.sideA),
  );
  const [opponentSubject, setOpponentSubject] = useState<MatchupSubjectState>(() =>
    subjectStateFromSideB(gameLog?.sideB),
  );
  const [firstPlayerSide, setFirstPlayerSide] = useState<GameSide>(gameLog?.firstPlayerSide ?? "A");
  const [bestOf, setBestOf] = useState<BestOf>(gameLog?.bestOf ?? FALLBACK_BEST_OF);
  const [gamesWonA, setGamesWonA] = useState(gameLog?.result.gamesWonA ?? 2);
  const [gamesWonB, setGamesWonB] = useState(gameLog?.result.gamesWonB ?? 1);
  const [factors, setFactors] = useState<ConfidenceFactors>(
    gameLog?.confidenceFactors ?? DEFAULT_FACTORS,
  );
  const [learnings, setLearnings] = useState(gameLog?.learnings ?? "");
  const [winType, setWinType] = useState<WinType | "">(gameLog?.winType ?? "");
  const [lossReason, setLossReason] = useState<LossReason | "">(gameLog?.lossReason ?? "");
  // The meta this game counts toward. `undefined` = not yet initialized (create mode,
  // before the current meta resolves) → the payload omits `metaId` and the server
  // auto-suggests from `playedAt`. `""` = the member explicitly chose "No meta" → the
  // payload sends `metaId: null`. A concrete id is sent as-is. On edit it seeds from
  // the stored meta (its auto-suggested value included).
  const [metaId, setMetaId] = useState<string | undefined>(
    gameLog ? (gameLog.metaId ?? "") : undefined,
  );
  const [impressiveCards, setImpressiveCards] = useState<GameLogCardInput[]>(
    gameLog?.impressiveCards.map((entry) => ({ cardId: entry.card.id, side: entry.side })) ?? [],
  );
  const [underperformingCards, setUnderperformingCards] = useState<GameLogCardInput[]>(
    gameLog?.underperformingCards.map((entry) => ({ cardId: entry.card.id, side: entry.side })) ??
      [],
  );
  const [cardNames, setCardNames] = useState<Map<string, string>>(() => {
    const seed = new Map<string, string>();
    for (const entry of gameLog?.impressiveCards ?? []) seed.set(entry.card.id, entry.card.name);
    for (const entry of gameLog?.underperformingCards ?? [])
      seed.set(entry.card.id, entry.card.name);
    return seed;
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  const createGame = useCreateGame(teamId);
  const updateGame = useUpdateGame(teamId, gameLog?.id ?? "");
  const mutation = isEditing ? updateGame : createGame;

  const previewWeight = deriveConfidenceWeight(factors);

  // In create mode, default our pilot to the current user once they resolve — the
  // friendly "defaults to you" — while leaving it optional and clearable. Applied at
  // most once, so re-clearing to "No pilot" is never overwritten. Never runs on edit.
  const selfPilotDefaultAppliedRef = useRef(false);
  useEffect(() => {
    if (isEditing || selfPilotDefaultAppliedRef.current || !currentUser?.id) return;
    selfPilotDefaultAppliedRef.current = true;
    setSelfSubject((current) =>
      current.pilotUserId ? current : { ...current, pilotUserId: currentUser.id },
    );
  }, [isEditing, currentUser]);

  // In create mode, adopt the game's default best-of once the config resolves —
  // resetting the result so it stays consistent — but only until the member has taken
  // control. Any interaction with the result (changing best-of or the outcome) or
  // advancing past the matchup step supersedes the default, so a late-resolving config
  // can never clobber a member's entry. In edit mode the stored best-of always wins.
  const configDefaultSupersededRef = useRef(false);
  const defaultBestOf = gameConfig?.defaultBestOf;
  useEffect(() => {
    if (isEditing || configDefaultSupersededRef.current || defaultBestOf === undefined) return;
    setBestOf(defaultBestOf);
    if (defaultBestOf === 1) {
      setGamesWonA(1);
      setGamesWonB(0);
    } else {
      setGamesWonA(Math.ceil(defaultBestOf / 2));
      setGamesWonB(0);
    }
  }, [defaultBestOf, isEditing]);

  // In create mode, default the meta link to the current meta once it resolves (mirrors
  // the server's auto-suggest for a game played today), leaving the member free to
  // change or clear it. `""` when no meta is current. Never runs on edit.
  useEffect(() => {
    if (isEditing || metaId !== undefined) return;
    if (currentMeta) {
      setMetaId(currentMeta.id);
    } else if (!currentMetaPending) {
      setMetaId("");
    }
  }, [isEditing, metaId, currentMeta, currentMetaPending]);

  function setFactor<Value extends string>(
    field: ConfidenceFactorField<Value>,
    value: Value,
  ): void {
    setFactors((current) => ({ ...current, [field.key]: value }));
  }

  /** Best-of-1 records a single Win/Loss/Draw; a match records games won per side. */
  function setSingleGameOutcome(outcome: "win" | "loss" | "draw"): void {
    configDefaultSupersededRef.current = true;
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
    configDefaultSupersededRef.current = true;
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

  function rememberCard(card: CardSummary): void {
    setCardNames((current) => {
      const next = new Map(current);
      next.set(card.id, card.name);
      return next;
    });
  }

  function isStepMatchupComplete(): boolean {
    return Boolean(
      formatId && isSubjectComplete(selfSubject) && isSubjectComplete(opponentSubject),
    );
  }

  function goNext(): void {
    setValidationError(null);
    if (step === 1) {
      if (!isStepMatchupComplete()) {
        setValidationError("Pick the format, your side, and identify the opponent.");
        return;
      }
      // Reaching the result step counts as taking control: a config that resolves
      // now must not reset the result the member is about to enter.
      configDefaultSupersededRef.current = true;
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!isGameResultConsistent(bestOf, { gamesWonA, gamesWonB })) {
        setValidationError("The result is not consistent with the best-of.");
        return;
      }
      setStep(3);
    }
  }

  function goBack(): void {
    setValidationError(null);
    if (showNotes) {
      setShowNotes(false);
      return;
    }
    if (step > 1) setStep((current) => (current - 1) as 1 | 2 | 3);
  }

  function submit(): void {
    setValidationError(null);

    if (!formatId) {
      setValidationError("Pick the format the game was played in.");
      return;
    }
    const sideA = buildSideAInput(selfSubject);
    if (!sideA) {
      setValidationError("Pick or describe the side you played.");
      return;
    }
    const sideB = buildSideBInput(opponentSubject);
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
      sideA,
      sideB,
      firstPlayerSide,
      bestOf,
      result,
      confidenceFactors: factors,
      learnings,
      impressiveCards,
      underperformingCards,
      // Omit while uninitialized (server auto-suggests); send null when explicitly cleared.
      ...(metaId === undefined ? {} : { metaId: metaId === "" ? null : metaId }),
      ...(winType ? { winType } : {}),
      ...(lossReason ? { lossReason } : {}),
    };

    mutation.mutate(payload, { onSuccess: onSaved });
  }

  const deckOptions = teamDecks?.data ?? [];
  const memberOptions = members?.data ?? [];
  const metaOptions = metas?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <WizardProgress
        step={step}
        {...(showNotes ? { label: "Notes & cards" } : {})}
        {...(step > 1 || showNotes ? { onBack: goBack } : {})}
      />

      {!showNotes && step === 1 ? (
        <StepMatchup
          teamId={teamId}
          formatId={formatId}
          setFormatId={setFormatId}
          selfSubject={selfSubject}
          setSelfSubject={setSelfSubject}
          opponentSubject={opponentSubject}
          setOpponentSubject={setOpponentSubject}
          deckOptions={deckOptions}
          memberOptions={memberOptions}
          currentMetaId={currentMeta?.id}
        />
      ) : null}

      {!showNotes && step === 2 ? (
        <StepResult
          firstPlayerSide={firstPlayerSide}
          setFirstPlayerSide={setFirstPlayerSide}
          bestOf={bestOf}
          changeBestOf={changeBestOf}
          gamesWonA={gamesWonA}
          setGamesWonA={setGamesWonA}
          gamesWonB={gamesWonB}
          setGamesWonB={setGamesWonB}
          setSingleGameOutcome={setSingleGameOutcome}
        />
      ) : null}

      {!showNotes && step === 3 ? (
        <StepConfidence
          factors={factors}
          setFactor={setFactor}
          previewWeight={previewWeight}
          onLog={submit}
          onAddNotes={() => {
            setValidationError(null);
            setShowNotes(true);
          }}
          isPending={mutation.isPending}
          isEditing={isEditing}
        />
      ) : null}

      {showNotes ? (
        <StepNotes
          teamId={teamId}
          impressiveCards={impressiveCards}
          setImpressiveCards={setImpressiveCards}
          underperformingCards={underperformingCards}
          setUnderperformingCards={setUnderperformingCards}
          onCaptureCard={rememberCard}
          cardNameOf={(cardId) => cardNames.get(cardId) ?? "Card"}
          metaId={metaId ?? ""}
          setMetaId={setMetaId}
          metaOptions={metaOptions}
          winType={winType}
          setWinType={setWinType}
          lossReason={lossReason}
          setLossReason={setLossReason}
          learnings={learnings}
          setLearnings={setLearnings}
          onSave={submit}
          isPending={mutation.isPending}
          isEditing={isEditing}
        />
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
        {!showNotes && (step === 1 || step === 2) ? (
          <Button type="button" onClick={goNext}>
            Next
          </Button>
        ) : null}
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
