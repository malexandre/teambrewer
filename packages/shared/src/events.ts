import { z } from "zod";

/**
 * Shared event / gauntlet / attendance contracts (see
 * docs/features/events-and-gauntlets.md, ADR-0004). The Event is the app's central
 * organizing hub: a target tournament (format + date + importance) that carries a
 * gauntlet (the field to beat, weighted by expected metagame share) and member
 * attendance (RSVP).
 *
 * Tenancy: `teamId` (and, for attendance, `userId`) are stamped server-side from
 * the verified request context — they are never accepted from the client, so
 * create/update inputs omit them and unknown keys are stripped. Game-agnostic:
 * nothing here hard-codes a game's formats or identity.
 */

/** Where an event sits in its lifecycle. Transitions are validated server-side. */
export const eventStatusSchema = z.enum(["upcoming", "active", "completed", "archived"]);
export type EventStatus = z.infer<typeof eventStatusSchema>;

/** How much the event matters; drives dashboard prioritization (consumers deferred). */
export const eventImportanceSchema = z.enum(["local", "regional", "national", "major"]);
export type EventImportance = z.infer<typeof eventImportanceSchema>;

/** A member's RSVP for an event. */
export const attendanceStatusSchema = z.enum(["going", "maybe", "not_going"]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

/**
 * Importance as an ordinal (local lowest … major highest) so lists and the
 * dashboard can sort by "how much it matters" without hard-coding the enum order
 * at each call site. The single source of truth for the ranking.
 */
export const eventImportanceRank: Record<EventImportance, number> = {
  local: 0,
  regional: 1,
  national: 2,
  major: 3,
};

/**
 * The event status lifecycle as data (docs/features/events-and-gauntlets.md):
 * `upcoming → active → completed → archived`, plus a cancellation shortcut to
 * `archived` from `upcoming`/`active`. `archived` is terminal (soft-delete). This
 * is the single source of truth shared by the API validator and the web status
 * control; a no-op (same status) is never a valid transition.
 */
export const eventStatusTransitions: Record<EventStatus, readonly EventStatus[]> = {
  upcoming: ["active", "archived"],
  active: ["completed", "archived"],
  completed: ["archived"],
  archived: [],
};

/** The statuses an event may move to from `from` (never itself). */
export function allowedNextEventStatuses(from: EventStatus): EventStatus[] {
  return [...eventStatusTransitions[from]];
}

/** Whether a status transition is permitted by the lifecycle. */
export function isEventStatusTransitionAllowed(from: EventStatus, to: EventStatus): boolean {
  return eventStatusTransitions[from].includes(to);
}

/** An event's display name. */
export const eventNameSchema = z
  .string()
  .trim()
  .min(1, "An event name is required.")
  .max(120, "An event name must be at most 120 characters.");

/**
 * The event date. Accepts any string a `Date` can parse — a calendar date
 * (`2026-09-12`, from a native date input) or a full ISO datetime — because an
 * event's date is a day, not a precise instant. Past dates are allowed
 * (back-filling a completed event). The service normalizes it to a `Date`.
 */
export const eventDateSchema = z
  .string()
  .refine((value) => value.trim().length > 0 && !Number.isNaN(Date.parse(value)), {
    message: "A valid event date is required.",
  });

/** Optional free-form venue/location. */
export const eventLocationSchema = z.string().trim().max(200);

/** Optional free-form prose about the event. */
export const eventDescriptionSchema = z.string().max(5000);

/** An entry's projected percentage of the field (whole numbers 0–100). */
export const expectedMetaShareSchema = z
  .number()
  .int("Expected meta share must be a whole number.")
  .min(0, "Expected meta share cannot be negative.")
  .max(100, "Expected meta share cannot exceed 100.");

/** A free-text archetype label used when the field is identified without a deck/hero. */
export const archetypeLabelSchema = z.string().trim().min(1).max(100);

/** Free-form notes on a gauntlet entry. */
export const gauntletNotesSchema = z.string().max(2000);

/**
 * Create-event input. Omits every server-controlled field: `teamId` comes from the
 * verified context and `status` starts at `upcoming`. Unknown keys are stripped, so
 * a spoofed `teamId`/`status` in the body is simply ignored.
 */
export const createEventSchema = z.object({
  name: eventNameSchema,
  formatId: z.string().min(1, "A format is required."),
  date: eventDateSchema,
  importance: eventImportanceSchema,
  location: eventLocationSchema.optional(),
  description: eventDescriptionSchema.default(""),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

/**
 * Update-event input. Partial and `.strict()`. Unlike decks, an event advances its
 * status through this same endpoint (the events API surface has no dedicated status
 * route), so `status` is an allowed key; the service validates the transition.
 * `location: null` clears the location.
 */
export const updateEventSchema = z
  .object({
    name: eventNameSchema.optional(),
    formatId: z.string().min(1).optional(),
    date: eventDateSchema.optional(),
    importance: eventImportanceSchema.optional(),
    location: eventLocationSchema.nullable().optional(),
    description: eventDescriptionSchema.optional(),
    status: eventStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** The gauntlet target forms; exactly one must be provided on a gauntlet entry. */
const gauntletTargetKeys = ["referenceDeckId", "heroId", "archetypeLabel"] as const;

function countPresentTargets(value: {
  referenceDeckId?: unknown;
  heroId?: unknown;
  archetypeLabel?: unknown;
}): number {
  return gauntletTargetKeys.filter((key) => value[key] !== undefined && value[key] !== null).length;
}

/**
 * Create-gauntlet-entry input. A gauntlet entry names exactly one target form — a
 * reference deck, a bare hero, or a free-text archetype label — plus its expected
 * field share. `eventId`/`teamId`/timestamps are server-stamped and omitted.
 */
export const createGauntletEntrySchema = z
  .object({
    referenceDeckId: z.string().min(1).optional(),
    heroId: z.string().min(1).optional(),
    archetypeLabel: archetypeLabelSchema.optional(),
    expectedMetaShare: expectedMetaShareSchema,
    notes: gauntletNotesSchema.default(""),
  })
  .refine((value) => countPresentTargets(value) === 1, {
    message:
      "A gauntlet entry must reference exactly one target: a reference deck, a hero, or an archetype label.",
  });
export type CreateGauntletEntryInput = z.infer<typeof createGauntletEntrySchema>;

/**
 * Update-gauntlet-entry input. The target form is immutable once set (to change it,
 * delete the entry and add a new one), so only the share and notes may change. The
 * schema is `.strict()`, which rejects any target-form key.
 */
export const updateGauntletEntrySchema = z
  .object({
    expectedMetaShare: expectedMetaShareSchema.optional(),
    notes: gauntletNotesSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdateGauntletEntryInput = z.infer<typeof updateGauntletEntrySchema>;

/** Set-my-RSVP input for the idempotent attendance upsert. */
export const setAttendanceSchema = z.object({ status: attendanceStatusSchema });
export type SetAttendanceInput = z.infer<typeof setAttendanceSchema>;

/**
 * Query parameters for `GET /api/events`. Values arrive as strings, so `limit` is
 * coerced. Archived events are excluded server-side regardless of filters.
 */
export const eventListQuerySchema = z.object({
  status: eventStatusSchema.optional(),
  formatId: z.string().optional(),
  importance: eventImportanceSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

/** An event as returned in list responses (description omitted; see detail). */
export const eventSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  formatId: z.string(),
  date: z.string(),
  location: z.string().nullable(),
  importance: eventImportanceSchema,
  status: eventStatusSchema,
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EventSummary = z.infer<typeof eventSummarySchema>;

/** One gauntlet entry as returned by the API. */
export const gauntletEntrySchema = z.object({
  id: z.string(),
  eventId: z.string(),
  referenceDeckId: z.string().nullable(),
  heroId: z.string().nullable(),
  archetypeLabel: z.string().nullable(),
  expectedMetaShare: z.number().int(),
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GauntletEntry = z.infer<typeof gauntletEntrySchema>;

/** A gauntlet (all of an event's entries), sorted by expected share descending. */
export const gauntletEntryListSchema = z.object({ data: z.array(gauntletEntrySchema) });
export type GauntletEntryList = z.infer<typeof gauntletEntryListSchema>;

/** A member's RSVP, denormalized with the member's display identity for the roster. */
export const attendanceSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  status: attendanceStatusSchema,
  user: z.object({
    userId: z.string(),
    username: z.string(),
    displayName: z.string(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Attendance = z.infer<typeof attendanceSchema>;

/** An event's full attendance roster. */
export const attendanceListSchema = z.object({ data: z.array(attendanceSchema) });
export type AttendanceList = z.infer<typeof attendanceListSchema>;

/** A tally of RSVPs by status, embedded in the event detail. */
export const attendanceSummarySchema = z.object({
  going: z.number().int(),
  maybe: z.number().int(),
  notGoing: z.number().int(),
});
export type AttendanceSummary = z.infer<typeof attendanceSummarySchema>;

/**
 * A single event with its full detail: prose description plus the embedded gauntlet
 * and an attendance summary, so the event hub renders in one request.
 */
export const eventDetailSchema = eventSummarySchema.extend({
  description: z.string(),
  gauntletEntries: z.array(gauntletEntrySchema),
  attendanceSummary: attendanceSummarySchema,
});
export type EventDetail = z.infer<typeof eventDetailSchema>;

/** Cursor-paginated response for `GET /api/events`. */
export const eventListResponseSchema = z.object({
  data: z.array(eventSummarySchema),
  nextCursor: z.string().nullable(),
});
export type EventListResponse = z.infer<typeof eventListResponseSchema>;
