import { z } from "zod";

/**
 * Shared deck-selection contracts (see docs/features/gameplans-and-deck-selection.md
 * §Deck selection, docs/domain/playtesting-methodology.md §6). A **DeckSelection** is
 * a per-member, per-event commitment: the deck that member will bring, plus free-text
 * reasoning. There is one selection per `(event, user)`.
 *
 * Locking is a team-admin action (never a member's), so the lock fields (`locked`,
 * `lockedAt`) are set server-side through the dedicated lock/unlock endpoints, not the
 * upsert body. `userId` comes from the verified request context. Both are omitted from
 * the input and unknown keys are stripped.
 */

/** Free-text reasoning for a deck selection ("why I'm bringing this"). */
export const deckSelectionReasoningSchema = z
  .string()
  .max(2000, "The reasoning must be at most 2000 characters.");

/**
 * Upsert body for `PUT /api/events/:eventId/deck-selections/me`. Names the deck the
 * caller commits to bring and their reasoning. `deckId` must be a deck in the same
 * team; the caller (`userId`) and lock state are server-controlled and omitted.
 */
export const setDeckSelectionSchema = z.object({
  deckId: z.string().min(1, "A deck is required."),
  reasoning: deckSelectionReasoningSchema.default(""),
});
export type SetDeckSelectionInput = z.infer<typeof setDeckSelectionSchema>;

/** A teammate's display identity, denormalized onto deck-selection rows. */
export const deckSelectionUserSchema = z.object({
  userId: z.string(),
  username: z.string(),
  displayName: z.string(),
});
export type DeckSelectionUser = z.infer<typeof deckSelectionUserSchema>;

/**
 * A deck selection as returned by the API. `deckFormatId` lets the UI warn when the
 * chosen deck's format differs from the event's (a warning, not a hard block — humans
 * own the roster). `locked`/`lockedAt` reflect the team-admin lock state.
 */
export const deckSelectionSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  member: deckSelectionUserSchema,
  deckId: z.string(),
  deckName: z.string(),
  deckFormatId: z.string(),
  reasoning: z.string(),
  locked: z.boolean(),
  lockedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DeckSelection = z.infer<typeof deckSelectionSchema>;

/** The roster of every member's selection for an event. */
export const deckSelectionListSchema = z.object({
  data: z.array(deckSelectionSchema),
});
export type DeckSelectionList = z.infer<typeof deckSelectionListSchema>;
