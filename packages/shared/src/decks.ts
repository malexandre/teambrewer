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

/**
 * The deck status lifecycle as data (permissive model, docs/features/decks.md):
 * for each status, the statuses it may transition to. The three active states
 * move freely in both directions; any active state may retire; a retired deck is
 * a reopenable terminal that returns only to `testing`. This is the single source
 * of truth shared by the API validator and the web status control, so the two can
 * never drift; a no-op (same status) is never a valid transition.
 */
export const deckStatusTransitions: Record<DeckStatus, readonly DeckStatus[]> = {
  exploratory: ["testing", "tournament_ready", "retired"],
  testing: ["exploratory", "tournament_ready", "retired"],
  tournament_ready: ["exploratory", "testing", "retired"],
  retired: ["testing"],
};

/** The statuses a deck may move to from `from` (never itself). */
export function allowedNextDeckStatuses(from: DeckStatus): DeckStatus[] {
  return [...deckStatusTransitions[from]];
}

/** Whether a status transition is permitted by the lifecycle. */
export function isDeckStatusTransitionAllowed(from: DeckStatus, to: DeckStatus): boolean {
  return deckStatusTransitions[from].includes(to);
}

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
export const iterationEntryBodySchema = z
  .string()
  .trim()
  .min(1, "An entry cannot be empty.")
  .max(2000);

/**
 * The metas a deck is linked to (`DeckMeta` join — a deck can belong to many
 * metas). Each id is validated server-side as belonging to the same team. On
 * create, **omitting** this links the current meta by default; passing it (even
 * an empty array) overrides that. On update, passing it **replaces** the whole
 * set. Distinct ids only.
 */
export const deckMetaIdsSchema = z
  .array(z.string().min(1))
  .max(50, "A deck can link at most 50 metas.")
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Linked metas must be distinct.",
  });

/**
 * Per-meta deck↔entry links: within a linked meta, the entry this deck is the
 * team's build of. At most one entry per meta; every `metaId` here must also be
 * in `metaIds` (cross-checked on the create/update schemas). Server-validated
 * same-team + same-meta.
 */
export const deckMetaEntryLinkSchema = z.object({
  metaId: z.string().min(1),
  metaDeckEntryId: z.string().min(1),
});
export type DeckMetaEntryLink = z.infer<typeof deckMetaEntryLinkSchema>;

export const deckMetaEntryLinksSchema = z
  .array(deckMetaEntryLinkSchema)
  .max(50)
  .refine((links) => new Set(links.map((link) => link.metaId)).size === links.length, {
    message: "A deck can link at most one entry per meta.",
  });

/**
 * Every entry-link's meta must be among the deck's linked metas. Only checked when
 * `metaIds` is also present in the payload (otherwise the linked-meta set isn't being
 * changed here and the server validates entry links against the stored set). The
 * server re-validates same-team/same-meta regardless.
 */
function entryLinksWithinMetas(value: {
  metaIds?: string[] | undefined;
  metaEntryLinks?: DeckMetaEntryLink[] | undefined;
}): boolean {
  if (!value.metaEntryLinks || value.metaEntryLinks.length === 0 || value.metaIds === undefined) {
    return true;
  }
  const metaIds = new Set(value.metaIds);
  return value.metaEntryLinks.every((link) => metaIds.has(link.metaId));
}

/**
 * Create-deck input. Omits every server-controlled field (`teamId`/`gameId`/
 * `ownerId`/`status`/`source`): `teamId`/`gameId`/`ownerId` come from the verified
 * context, `status` starts at `exploratory`, and `source` is set by URL
 * recognition. Unknown keys are stripped (Zod's default), so a spoofed `teamId`
 * in the body is simply ignored.
 */
export const createDeckSchema = z
  .object({
    name: deckNameSchema,
    formatId: z.string().min(1, "A format is required."),
    heroId: z.string().min(1).optional(),
    externalUrl: deckExternalUrlSchema,
    visibility: deckVisibilitySchema.default("team"),
    tags: deckTagsSchema.default([]),
    notes: deckNotesSchema.default(""),
    // Omitted → link the current meta by default; provided (even []) → override.
    metaIds: deckMetaIdsSchema.optional(),
    // Optional per-meta entry links (the deck's build of a meta deck entry).
    metaEntryLinks: deckMetaEntryLinksSchema.optional(),
  })
  .refine(entryLinksWithinMetas, {
    message: "An entry link's meta must be one of the deck's linked metas.",
    path: ["metaEntryLinks"],
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
    tags: deckTagsSchema.optional(),
    notes: deckNotesSchema.optional(),
    // Provided → replaces the deck's whole linked-meta set (validated same-team).
    metaIds: deckMetaIdsSchema.optional(),
    // Provided → replaces the deck's per-meta entry links.
    metaEntryLinks: deckMetaEntryLinksSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  })
  .refine(entryLinksWithinMetas, {
    message: "An entry link's meta must be one of the deck's linked metas.",
    path: ["metaEntryLinks"],
  });
export type UpdateDeckInput = z.infer<typeof updateDeckSchema>;

/** Status-change input for the dedicated status endpoint. */
export const deckStatusChangeSchema = z.object({ status: deckStatusSchema });
export type DeckStatusChangeInput = z.infer<typeof deckStatusChangeSchema>;

/** Append-only iteration-log entry input. */
export const createIterationEntrySchema = z.object({ body: iterationEntryBodySchema });
export type CreateIterationEntryInput = z.infer<typeof createIterationEntrySchema>;

/**
 * Query parameters for `GET /api/decks`. Values arrive as strings, so numeric params
 * are coerced. Other users' `private` drafts are excluded server-side regardless.
 */
export const deckListQuerySchema = z.object({
  heroId: z.string().optional(),
  formatId: z.string().optional(),
  status: deckStatusSchema.optional(),
  tag: z.string().optional(),
  visibility: deckVisibilitySchema.optional(),
  ownerId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type DeckListQuery = z.infer<typeof deckListQuerySchema>;

/**
 * The meta deck entry a deck is linked to within one meta, denormalized onto the
 * deck summary so surfaces like the game logger can annotate a team deck ("this is
 * our build of <entry>") without a detail fetch. Only linked metas appear here.
 */
export const deckLinkedMetaEntrySchema = z.object({
  metaId: z.string(),
  metaDeckEntryId: z.string(),
  /** The entry's durable `opponentSnapshotLabel` (hero · label). */
  label: z.string(),
});
export type DeckLinkedMetaEntry = z.infer<typeof deckLinkedMetaEntrySchema>;

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
  tags: z.array(z.string()),
  // Per-meta entry links (only metas where an entry is linked); drives the logger badge.
  linkedMetaEntries: z.array(deckLinkedMetaEntrySchema).default([]),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DeckSummary = z.infer<typeof deckSummarySchema>;

/**
 * A meta a deck is linked to, denormalized onto the deck detail. Carries the deck's
 * chosen entry within that meta (or null), so the deck form seeds the per-meta entry
 * select and the deck page shows the link.
 */
export const deckLinkedMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  metaDeckEntryId: z.string().nullable().default(null),
  metaDeckEntryLabel: z.string().nullable().default(null),
});
export type DeckLinkedMeta = z.infer<typeof deckLinkedMetaSchema>;

/**
 * A single deck with its full detail: prose notes plus the metas it is linked to
 * (`DeckMeta`). `linkedMetas` seeds the meta multi-select on edit and is shown on
 * the deck page; the list response omits it (see summary).
 */
export const deckDetailSchema = deckSummarySchema.extend({
  notes: z.string(),
  linkedMetas: z.array(deckLinkedMetaSchema),
});
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
