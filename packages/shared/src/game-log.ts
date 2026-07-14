import { z } from "zod";

import { archetypeLabelSchema } from "./events.js";
import { cardSummarySchema } from "./cards.js";

/**
 * Shared game-log contracts (see docs/features/game-logging.md, ADR-0005). A game
 * log is one recorded game/match between two sides plus the structured confidence
 * factors that make the result trustworthy. It is the source of truth for every
 * matchup aggregate built later (phase-07).
 *
 * Tenancy: `teamId` and `loggedById` are stamped server-side from the verified
 * request context — never accepted from the client, so create/update inputs omit
 * them. The derived `confidenceWeight` is likewise server-authoritative and appears
 * only in responses; a client-supplied weight is ignored.
 *
 * The confidence-weight model (finalized in phase-06, ADR-0005): four factors, each
 * a 3-level enum → sub-score 1.0 / 0.7 / 0.4, combined as a weighted mean with the
 * per-factor weights below. All-best → 1.0, all-worst → 0.4 (the documented floor).
 * The scores and weights are the single tunable source of truth for the derivation.
 */

// --- Confidence factors -----------------------------------------------------

/** How evenly matched the two pilots were (the strongest trust signal). */
export const skillParitySchema = z.enum(["evenly_matched", "minor_gap", "major_gap"]);
export type SkillParity = z.infer<typeof skillParitySchema>;

/** How serious/focused the games were (tournament-serious ↔ casual). */
export const seriousnessSchema = z.enum(["tournament_serious", "focused_practice", "casual"]);
export type Seriousness = z.infer<typeof seriousnessSchema>;

/** How tuned/final both decks were (final ↔ experimental brew). */
export const deckMaturitySchema = z.enum(["both_tuned", "partially_tuned", "experimental"]);
export type DeckMaturity = z.infer<typeof deckMaturitySchema>;

/** How well the pilot knew the deck. */
export const pilotFamiliaritySchema = z.enum(["knows_well", "learning", "first_time"]);
export type PilotFamiliarity = z.infer<typeof pilotFamiliaritySchema>;

/** Each factor's enum → 0–1 sub-score. Best = 1.0, mid = 0.7, worst = 0.4. */
const skillParityScore: Record<SkillParity, number> = {
  evenly_matched: 1.0,
  minor_gap: 0.7,
  major_gap: 0.4,
};
const seriousnessScore: Record<Seriousness, number> = {
  tournament_serious: 1.0,
  focused_practice: 0.7,
  casual: 0.4,
};
const deckMaturityScore: Record<DeckMaturity, number> = {
  both_tuned: 1.0,
  partially_tuned: 0.7,
  experimental: 0.4,
};
const pilotFamiliarityScore: Record<PilotFamiliarity, number> = {
  knows_well: 1.0,
  learning: 0.7,
  first_time: 0.4,
};

/**
 * Per-factor weights for the weighted-mean combination (finalized in phase-06).
 * skillParity and seriousness matter most; they sum to 1 so the weight stays in
 * `[0, 1]`. Tunable in this one place.
 */
export const confidenceFactorWeights = {
  skillParity: 0.35,
  seriousness: 0.25,
  deckMaturity: 0.25,
  pilotFamiliarity: 0.15,
} as const;

/**
 * The four confidence factors, each defaulting to its best level so a fast save
 * (accepting every default) yields a fully-trusted `confidenceWeight` of 1.0.
 */
export const confidenceFactorsSchema = z.object({
  skillParity: skillParitySchema.default("evenly_matched"),
  seriousness: seriousnessSchema.default("tournament_serious"),
  deckMaturity: deckMaturitySchema.default("both_tuned"),
  pilotFamiliarity: pilotFamiliaritySchema.default("knows_well"),
});
export type ConfidenceFactors = z.infer<typeof confidenceFactorsSchema>;

/** Partial confidence factors for an edit; the service merges with the stored set. */
export const confidenceFactorsUpdateSchema = z.object({
  skillParity: skillParitySchema.optional(),
  seriousness: seriousnessSchema.optional(),
  deckMaturity: deckMaturitySchema.optional(),
  pilotFamiliarity: pilotFamiliaritySchema.optional(),
});
export type ConfidenceFactorsUpdate = z.infer<typeof confidenceFactorsUpdateSchema>;

/**
 * Derive `confidenceWeight ∈ [0, 1]` from the four factors as a weighted mean of
 * their sub-scores (ADR-0005). The single, well-tested derivation shared by the
 * server (authoritative) and the web form (live preview). Rounded to 4 decimals to
 * keep stored/compared values free of floating-point noise.
 */
export function deriveConfidenceWeight(factors: ConfidenceFactors): number {
  const weighted =
    skillParityScore[factors.skillParity] * confidenceFactorWeights.skillParity +
    seriousnessScore[factors.seriousness] * confidenceFactorWeights.seriousness +
    deckMaturityScore[factors.deckMaturity] * confidenceFactorWeights.deckMaturity +
    pilotFamiliarityScore[factors.pilotFamiliarity] * confidenceFactorWeights.pilotFamiliarity;
  return Math.round(weighted * 10000) / 10000;
}

// --- Result / match shape ---------------------------------------------------

/** Which side took the first turn (going first matters for FaB matchups). */
export const gameSideSchema = z.enum(["A", "B"]);
export type GameSide = z.infer<typeof gameSideSchema>;

/** Single game (`1`) or a match (`3`/`5`). */
export const bestOfSchema = z.union([z.literal(1), z.literal(3), z.literal(5)]);
export type BestOf = z.infer<typeof bestOfSchema>;

/** Games won by each side; models both single games ({1,0}/{0,0}) and matches. */
export const gameResultSchema = z.object({
  gamesWonA: z.number().int().min(0),
  gamesWonB: z.number().int().min(0),
});
export type GameResult = z.infer<typeof gameResultSchema>;

/**
 * Whether a `result` is consistent with its `bestOf`: neither side exceeds the win
 * threshold `ceil(bestOf/2)`, the games played do not exceed `bestOf`, and both
 * sides cannot reach the threshold. A `{0,0}` single-game draw and an unfinished
 * `{1,1}` best-of-3 are both consistent. The single source of truth shared by the
 * schema refinement and the service.
 */
export function isGameResultConsistent(bestOf: number, result: GameResult): boolean {
  const { gamesWonA, gamesWonB } = result;
  if (gamesWonA < 0 || gamesWonB < 0) return false;
  const winThreshold = Math.ceil(bestOf / 2);
  if (gamesWonA > winThreshold || gamesWonB > winThreshold) return false;
  if (gamesWonA + gamesWonB > bestOf) return false;
  if (gamesWonA === winThreshold && gamesWonB === winThreshold) return false;
  return true;
}

/** Optional tag for how a win was achieved; does not affect the confidence weight. */
export const winTypeSchema = z.enum(["life_to_zero", "on_time", "opponent_concede", "deck_out"]);
export type WinType = z.infer<typeof winTypeSchema>;

/** Optional tag for why a game was lost; does not affect the confidence weight. */
export const lossReasonSchema = z.enum([
  "outplayed",
  "misplay",
  "on_time",
  "mismatch",
  "variance",
  "deck_out",
]);
export type LossReason = z.infer<typeof lossReasonSchema>;

/** Free-text takeaways from the game. */
export const learningsSchema = z.string().max(2000);

/** Whether a card over- or under-performed in the game. */
export const gameLogCardRoleSchema = z.enum(["impressive", "underperforming"]);
export type GameLogCardRole = z.infer<typeof gameLogCardRoleSchema>;

/** Whose card it was: our side or the opponent's. */
export const gameLogCardSideSchema = z.enum(["ours", "theirs"]);
export type GameLogCardSide = z.infer<typeof gameLogCardSideSchema>;

/** A card reference captured on a game log, tagged by side. */
export const gameLogCardInputSchema = z.object({
  cardId: z.string().min(1),
  side: gameLogCardSideSchema,
});
export type GameLogCardInput = z.infer<typeof gameLogCardInputSchema>;

/** A captured card as returned by the API (the card summary + its side). */
export const gameLogCardSchema = z.object({
  card: cardSummarySchema,
  side: gameLogCardSideSchema,
});
export type GameLogCard = z.infer<typeof gameLogCardSchema>;

/**
 * When the game was played. Accepts any string a `Date` can parse; optional on
 * create (the service defaults to now). Past dates are allowed (back-filling).
 */
export const playedAtSchema = z
  .string()
  .refine((value) => value.trim().length > 0 && !Number.isNaN(Date.parse(value)), {
    message: "A valid played-at date is required.",
  });

// --- Player category --------------------------------------------------------

/**
 * Who was at the controls of a side, categorically. We deliberately do **not**
 * record which specific person played — only whether it was someone from the
 * team, a known competitive ("circuit") player, or anyone else. Both sides carry
 * one (the self side defaults to `teammate`, the opponent to `other`).
 */
export const playerCategorySchema = z.enum(["teammate", "circuit_player", "other"]);
export type PlayerCategory = z.infer<typeof playerCategorySchema>;

/** The player categories in display order (for the radio). */
export const PLAYER_CATEGORIES = playerCategorySchema.options;

/** Human labels for the player categories (single place so the UI reads consistently). */
export const PLAYER_CATEGORY_LABELS: Record<PlayerCategory, string> = {
  teammate: "Teammate",
  circuit_player: "Circuit player",
  other: "Other",
};

// --- Sides (matchup subjects) -----------------------------------------------

/**
 * Both game-log sides are **matchup subjects**: exactly one of a team `deckId`, a
 * `metaDeckEntryId`, or a `heroId` (with an optional free-text `archetypeLabel`
 * qualifier). `deckId`/`metaDeckEntryId`/`heroId` are the three mutually exclusive
 * forms; an `archetypeLabel` is only meaningful alongside a `heroId` (so the free
 * "Other" form requires a hero, and the label is optional).
 */
const matchupSubjectFormKeys = ["deckId", "metaDeckEntryId", "heroId"] as const;

function countSubjectForms(value: {
  deckId?: unknown;
  metaDeckEntryId?: unknown;
  heroId?: unknown;
}): number {
  return matchupSubjectFormKeys.filter((key) => value[key] !== undefined && value[key] !== null)
    .length;
}

/** Add the exactly-one-subject + label-needs-hero issues to a side's refinement. */
function refineMatchupSubject(
  value: {
    deckId?: string | undefined;
    metaDeckEntryId?: string | undefined;
    heroId?: string | undefined;
    archetypeLabel?: string | undefined;
  },
  ctx: z.RefinementCtx,
  sideLabel: string,
): void {
  if (countSubjectForms(value) !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${sideLabel} must be exactly one of: a team deck, a meta deck entry, or a hero.`,
    });
  }
  if (value.archetypeLabel && !value.heroId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `A ${sideLabel.toLowerCase()} archetype label needs a hero.`,
    });
  }
}

/**
 * Our side: a matchup subject (team deck / meta deck entry / hero + optional label)
 * plus a `playerCategory` classifying who piloted it (defaults to `teammate`).
 */
export const gameSideASchema = z
  .object({
    playerCategory: playerCategorySchema.default("teammate"),
    deckId: z.string().min(1).optional(),
    metaDeckEntryId: z.string().min(1).optional(),
    heroId: z.string().min(1).optional(),
    archetypeLabel: archetypeLabelSchema.optional(),
  })
  .superRefine((value, ctx) => refineMatchupSubject(value, ctx, "Our side"));
export type GameSideA = z.infer<typeof gameSideASchema>;

/**
 * The opponent side: a matchup subject (team deck / meta deck entry / hero + optional
 * label) plus a `playerCategory` classifying the opponent (defaults to `other`).
 */
export const gameSideBSchema = z
  .object({
    playerCategory: playerCategorySchema.default("other"),
    deckId: z.string().min(1).optional(),
    metaDeckEntryId: z.string().min(1).optional(),
    heroId: z.string().min(1).optional(),
    archetypeLabel: archetypeLabelSchema.optional(),
  })
  .superRefine((value, ctx) => refineMatchupSubject(value, ctx, "The opponent"));
export type GameSideB = z.infer<typeof gameSideBSchema>;

// --- Create / update inputs -------------------------------------------------

/**
 * Create-game-log input. Omits every server-controlled field (`teamId`,
 * `loggedById`, timestamps) and never accepts `confidenceWeight` — it is derived
 * server-side from `confidenceFactors`. Unknown keys are stripped.
 */
export const createGameLogSchema = z
  .object({
    formatId: z.string().min(1, "A format is required."),
    // The meta this game counts toward. Omitting it lets the server auto-suggest the
    // meta whose window contains `playedAt`; an explicit `null` records no meta.
    metaId: z.string().min(1).nullable().optional(),
    playedAt: playedAtSchema.optional(),
    sideA: gameSideASchema,
    sideB: gameSideBSchema,
    firstPlayerSide: gameSideSchema,
    bestOf: bestOfSchema,
    result: gameResultSchema,
    winType: winTypeSchema.optional(),
    lossReason: lossReasonSchema.optional(),
    learnings: learningsSchema.default(""),
    // A fully-resolved default: `.default()` short-circuits the object parse, so an
    // omitted `confidenceFactors` must carry every field. A partial object still
    // fills the rest via the per-field defaults on `confidenceFactorsSchema`.
    confidenceFactors: confidenceFactorsSchema.default({
      skillParity: "evenly_matched",
      seriousness: "tournament_serious",
      deckMaturity: "both_tuned",
      pilotFamiliarity: "knows_well",
    }),
    impressiveCards: z.array(gameLogCardInputSchema).max(20).default([]),
    underperformingCards: z.array(gameLogCardInputSchema).max(20).default([]),
  })
  .refine((value) => isGameResultConsistent(value.bestOf, value.result), {
    message: "The result is not consistent with the best-of.",
    path: ["result"],
  });
export type CreateGameLogInput = z.infer<typeof createGameLogSchema>;

/**
 * Update-game-log input. Partial and `.strict()`; `confidenceWeight` is never
 * accepted. `confidenceFactors` may be a partial change (merged server-side, which
 * re-derives the weight). `metaId`/`winType`/`lossReason` accept `null` to clear.
 * result↔bestOf consistency is re-checked server-side against the merged values.
 */
export const updateGameLogSchema = z
  .object({
    formatId: z.string().min(1).optional(),
    metaId: z.string().min(1).nullable().optional(),
    playedAt: playedAtSchema.optional(),
    sideA: gameSideASchema.optional(),
    sideB: gameSideBSchema.optional(),
    firstPlayerSide: gameSideSchema.optional(),
    bestOf: bestOfSchema.optional(),
    result: gameResultSchema.optional(),
    winType: winTypeSchema.nullable().optional(),
    lossReason: lossReasonSchema.nullable().optional(),
    learnings: learningsSchema.optional(),
    confidenceFactors: confidenceFactorsUpdateSchema.optional(),
    impressiveCards: z.array(gameLogCardInputSchema).max(20).optional(),
    underperformingCards: z.array(gameLogCardInputSchema).max(20).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdateGameLogInput = z.infer<typeof updateGameLogSchema>;

/**
 * Query parameters for `GET /api/game-logs`. Values arrive as strings, so `limit`
 * is coerced. `deckId`/`heroId` match either side. Archived logs are excluded
 * server-side.
 */
export const gameLogListQuerySchema = z.object({
  formatId: z.string().optional(),
  metaId: z.string().optional(),
  deckId: z.string().optional(),
  heroId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type GameLogListQuery = z.infer<typeof gameLogListQuerySchema>;

// --- Response shapes --------------------------------------------------------

/** The resolved self side as returned by the API (unused subject forms are null). */
export const gameSideAResponseSchema = z.object({
  playerCategory: playerCategorySchema,
  deckId: z.string().nullable(),
  metaDeckEntryId: z.string().nullable(),
  heroId: z.string().nullable(),
  archetypeLabel: z.string().nullable(),
});

/** The resolved opponent side as returned by the API (unused subject forms are null). */
export const gameSideBResponseSchema = z.object({
  playerCategory: playerCategorySchema,
  deckId: z.string().nullable(),
  metaDeckEntryId: z.string().nullable(),
  heroId: z.string().nullable(),
  archetypeLabel: z.string().nullable(),
});

/** A game log as returned in list responses (learnings/factors omitted; see detail). */
export const gameLogSummarySchema = z.object({
  id: z.string(),
  loggedById: z.string(),
  formatId: z.string(),
  metaId: z.string().nullable(),
  playedAt: z.string(),
  sideA: gameSideAResponseSchema,
  sideB: gameSideBResponseSchema,
  firstPlayerSide: gameSideSchema,
  bestOf: bestOfSchema,
  result: gameResultSchema,
  winType: winTypeSchema.nullable(),
  lossReason: lossReasonSchema.nullable(),
  confidenceWeight: z.number(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GameLogSummary = z.infer<typeof gameLogSummarySchema>;

/** A single game log with its full detail: learnings plus the confidence factors. */
export const gameLogDetailSchema = gameLogSummarySchema.extend({
  learnings: z.string(),
  confidenceFactors: z.object({
    skillParity: skillParitySchema,
    seriousness: seriousnessSchema,
    deckMaturity: deckMaturitySchema,
    pilotFamiliarity: pilotFamiliaritySchema,
  }),
  impressiveCards: z.array(gameLogCardSchema),
  underperformingCards: z.array(gameLogCardSchema),
});
export type GameLogDetail = z.infer<typeof gameLogDetailSchema>;

/** Cursor-paginated response for `GET /api/game-logs`. */
export const gameLogListResponseSchema = z.object({
  data: z.array(gameLogSummarySchema),
  nextCursor: z.string().nullable(),
});
export type GameLogListResponse = z.infer<typeof gameLogListResponseSchema>;
