import { z } from "zod";

/**
 * Shared deck contracts (see docs/features/decks.md, ADR-0002). A deck is a
 * link-only entity: `{ hero/identity, format, externalUrl, metadata }` plus a
 * manual prose iteration log — there is NO stored card list, import, or builder.
 *
 * Tenancy: `teamId`, `gameId`, `ownerId`, and the recognized `source` are stamped
 * server-side from the verified request context and the game adapter — they are
 * never accepted from the client, so create/update inputs deliberately omit them.
 * Game-agnostic: nothing here hard-codes a game's formats, identity, or providers.
 */

/** Where a deck sits in its testing lifecycle. Transitions are validated server-side. */
export const deckStatusSchema = z.enum(["exploratory", "testing", "tournament_ready", "retired"]);
export type DeckStatus = z.infer<typeof deckStatusSchema>;

/** `team` = visible to all members; `private` = a personal draft (owner + team-admins only). */
export const deckVisibilitySchema = z.enum(["team", "private"]);
export type DeckVisibility = z.infer<typeof deckVisibilitySchema>;

/** A deck's display name. */
export const deckNameSchema = z
  .string()
  .trim()
  .min(1, "A deck name is required.")
  .max(100, "A deck name must be at most 100 characters.");

/**
 * The external deck link. Restricted to http(s): the app renders it as a
 * clickable link, so `javascript:`/`data:` and other schemes are rejected. The
 * app never fetches or parses the linked contents (ADR-0007) — it only stores and
 * links out to the URL.
 */
export const deckExternalUrlSchema = z.url({ protocol: /^https?$/ });

/** Free-form organizational labels. */
export const deckTagSchema = z.string().trim().min(1).max(40);
export const deckTagsSchema = z.array(deckTagSchema).max(20);

/** Free-form prose notes about the deck. */
export const deckNotesSchema = z.string().max(5000);

/** The body of a single iteration-log entry (a prose changelog line). */
export const iterationEntryBodySchema = z.string().trim().min(1, "An entry cannot be empty.").max(2000);

/**
 * Create-deck input. Omits every server-controlled field (`teamId`/`gameId`/
 * `ownerId`/`status`/`source`): `teamId`/`gameId`/`ownerId` come from the verified
 * context, `status` starts at `exploratory`, and `source` is set by URL
 * recognition. Unknown keys are stripped (Zod's default), so a spoofed `teamId`
 * in the body is simply ignored.
 */
export const createDeckSchema = z.object({
  name: deckNameSchema,
  formatId: z.string().min(1, "A format is required."),
  heroId: z.string().min(1).optional(),
  externalUrl: deckExternalUrlSchema,
  visibility: deckVisibilitySchema.default("team"),
  isReference: z.boolean().default(false),
  tags: deckTagsSchema.default([]),
  notes: deckNotesSchema.default(""),
});
export type CreateDeckInput = z.infer<typeof createDeckSchema>;

/**
 * Update-deck input. Partial, and `.strict()` so a `status` key (or any other
 * unknown field) is rejected — status changes must go through the dedicated
 * status endpoint that validates transitions. `heroId: null` clears the hero.
 */
export const updateDeckSchema = z
  .object({
    name: deckNameSchema.optional(),
    formatId: z.string().min(1).optional(),
    heroId: z.string().min(1).nullable().optional(),
    externalUrl: deckExternalUrlSchema.optional(),
    visibility: deckVisibilitySchema.optional(),
    isReference: z.boolean().optional(),
    tags: deckTagsSchema.optional(),
    notes: deckNotesSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdateDeckInput = z.infer<typeof updateDeckSchema>;

/** Status-change input for the dedicated status endpoint. */
export const deckStatusChangeSchema = z.object({ status: deckStatusSchema });
export type DeckStatusChangeInput = z.infer<typeof deckStatusChangeSchema>;

/** Append-only iteration-log entry input. */
export const createIterationEntrySchema = z.object({ body: iterationEntryBodySchema });
export type CreateIterationEntryInput = z.infer<typeof createIterationEntrySchema>;

/**
 * Query parameters for `GET /api/decks`. Values arrive as strings, so numeric and
 * boolean params are coerced. `isReference` is decoded from the exact strings
 * `"true"`/`"false"` (not `z.coerce.boolean`, which would treat `"false"` as
 * truthy). Other users' `private` drafts are excluded server-side regardless.
 */
export const deckListQuerySchema = z.object({
  heroId: z.string().optional(),
  formatId: z.string().optional(),
  status: deckStatusSchema.optional(),
  isReference: z
    .union([z.literal("true"), z.literal("false")])
    .transform((value) => value === "true")
    .optional(),
  tag: z.string().optional(),
  visibility: deckVisibilitySchema.optional(),
  ownerId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type DeckListQuery = z.infer<typeof deckListQuerySchema>;

/** A deck as returned in list responses (notes omitted; see detail). */
export const deckSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  gameId: z.string(),
  formatId: z.string(),
  heroId: z.string().nullable(),
  externalUrl: z.string(),
  source: z.string(),
  ownerId: z.string(),
  status: deckStatusSchema,
  visibility: deckVisibilitySchema,
  isReference: z.boolean(),
  tags: z.array(z.string()),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DeckSummary = z.infer<typeof deckSummarySchema>;

/** A single deck with its full detail (adds prose notes to the summary). */
export const deckDetailSchema = deckSummarySchema.extend({ notes: z.string() });
export type DeckDetail = z.infer<typeof deckDetailSchema>;

/** Cursor-paginated response for `GET /api/decks`. */
export const deckListResponseSchema = z.object({
  data: z.array(deckSummarySchema),
  nextCursor: z.string().nullable(),
});
export type DeckListResponse = z.infer<typeof deckListResponseSchema>;

/** One entry of a deck's iteration log. */
export const iterationEntrySchema = z.object({
  id: z.string(),
  deckId: z.string(),
  authorId: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type IterationEntry = z.infer<typeof iterationEntrySchema>;

/** A deck's iteration log (most-recent-first). */
export const iterationEntryListSchema = z.object({ data: z.array(iterationEntrySchema) });
export type IterationEntryList = z.infer<typeof iterationEntryListSchema>;

/**
 * Best-effort deck-URL recognition input. Accepts any string (recognition is
 * URL-pattern only and returns null for anything unrecognized), so a half-typed
 * URL in the form yields `{ recognized: null }` rather than a validation error.
 */
export const recognizeDeckUrlRequestSchema = z.object({ url: z.string().max(2000) });
export type RecognizeDeckUrlRequest = z.infer<typeof recognizeDeckUrlRequestSchema>;

/** A recognized provider (label + optional provider-side id), or null. */
export const recognizedDeckUrlSchema = z
  .object({ provider: z.string(), externalId: z.string().optional() })
  .nullable();
export type RecognizedDeckUrl = z.infer<typeof recognizedDeckUrlSchema>;

/** Response for `POST /api/decks/recognize-url`. */
export const recognizeDeckUrlResponseSchema = z.object({ recognized: recognizedDeckUrlSchema });
export type RecognizeDeckUrlResponse = z.infer<typeof recognizeDeckUrlResponseSchema>;
