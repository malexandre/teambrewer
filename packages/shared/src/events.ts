import { z } from "zod";

/**
 * Shared event / attendance contracts (see docs/features/events-and-gauntlets.md).
 * After the meta-pivot redesign (WS-5) the Event is a lightweight, social board
 * item: a named, dated get-together with an optional venue and description, plus
 * per-member RSVP. Events are isolated — they no longer carry a status lifecycle,
 * importance, a format, a gauntlet, deck selections, a retrospective, or a link to a
 * meta, and are not a commentable subject.
 *
 * A member who is `going` may additionally record per-member travel logistics — three
 * legs (outbound transport, lodging, return transport), each `sorted`/`searching`/
 * `not_needed` with an optional free-text note — so the team can coordinate rides and
 * lodging and see at a glance who still needs help. Travel is self-service (each member
 * sets their own) but visible to the whole team on the roster.
 *
 * Tenancy: `teamId` and `gameId` (and, for attendance, `userId`) are stamped
 * server-side from the verified request context — they are never accepted from the
 * client, so create/update inputs omit them and unknown keys are stripped.
 */

/** A member's RSVP for an event (absence = not going). */
export const attendanceStatusSchema = z.enum(["going", "interested"]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

/**
 * A member's status for one leg of an event trip. `sorted` = has a solution (with an
 * optional free-text note saying which), `searching` = still needs one (the "needs help"
 * signal the roster surfaces at a glance), `not_needed` = deliberately not required (e.g. a
 * same-day round trip needs no lodging). A `null` status means the member hasn't said yet.
 * Travel logistics are only meaningful for a `going` member.
 */
export const travelLegStatusSchema = z.enum(["sorted", "searching", "not_needed"]);
export type TravelLegStatus = z.infer<typeof travelLegStatusSchema>;

/** An optional free-text "which one" note for a sorted leg (e.g. "Car with Sam"). */
export const travelLegDetailSchema = z.string().trim().max(200);

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
 * (back-filling a past event). The service normalizes it to a `Date`.
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

/**
 * A free-text archetype label used to identify an opponent form without a deck/hero.
 * Lives here for historical reasons (it originated with the gauntlet) and is reused
 * by game logs, game-plans, matchups, and meta deck entries.
 */
export const archetypeLabelSchema = z.string().trim().min(1).max(100);

/**
 * Create-event input. Omits every server-controlled field (`teamId`/`gameId`/
 * timestamps). Unknown keys are stripped, so a spoofed `teamId` in the body is
 * simply ignored.
 */
export const createEventSchema = z.object({
  name: eventNameSchema,
  date: eventDateSchema,
  location: eventLocationSchema.optional(),
  description: eventDescriptionSchema.default(""),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

/**
 * Update-event input. Partial and `.strict()`. `location: null` clears the field.
 * Must change at least one field.
 */
export const updateEventSchema = z
  .object({
    name: eventNameSchema.optional(),
    date: eventDateSchema.optional(),
    location: eventLocationSchema.nullable().optional(),
    description: eventDescriptionSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "An update must change at least one field.",
  });
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** Set-my-RSVP input for the idempotent attendance upsert. */
export const setAttendanceSchema = z.object({ status: attendanceStatusSchema });
export type SetAttendanceInput = z.infer<typeof setAttendanceSchema>;

/**
 * One trip leg as submitted by a member. `detail` is only meaningful when `status` is
 * `sorted`; the server clears it for any other status so a stale note can't linger on a
 * "not needed"/"searching" leg.
 */
export const travelLegInputSchema = z.object({
  status: travelLegStatusSchema.nullable(),
  detail: travelLegDetailSchema.optional(),
});
export type TravelLegInput = z.infer<typeof travelLegInputSchema>;

/**
 * Set-my-travel input: a full replace of the member's three-leg plan for an event
 * (outbound transport, lodging, return transport). The member is derived from the verified
 * request context, never the body; it requires an existing `going` RSVP for the event.
 */
export const setTravelSchema = z.object({
  outboundTransport: travelLegInputSchema,
  lodging: travelLegInputSchema,
  returnTransport: travelLegInputSchema,
});
export type SetTravelInput = z.infer<typeof setTravelSchema>;

/**
 * Query parameters for `GET /api/events`. Values arrive as strings, so `limit` is
 * coerced. Archived events are excluded server-side regardless of filters.
 */
export const eventListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});
export type EventListQuery = z.infer<typeof eventListQuerySchema>;

/**
 * An event as returned in list responses (description omitted; see detail). Carries
 * a lightweight RSVP tally — `goingCount`/`interestedCount` (the number of members
 * whose attendance status is `going`/`interested`) — so the list can show turnout on
 * each row without a per-event round-trip. The API computes both with a single
 * grouped count over the page's events.
 */
export const eventSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  gameId: z.string(),
  date: z.string(),
  location: z.string().nullable(),
  goingCount: z.number().int(),
  interestedCount: z.number().int(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EventSummary = z.infer<typeof eventSummarySchema>;

/** One trip leg as returned in the roster: a status (or null = unspecified) plus an optional note. */
export const travelLegSchema = z.object({
  status: travelLegStatusSchema.nullable(),
  detail: z.string().nullable(),
});
export type TravelLeg = z.infer<typeof travelLegSchema>;

/**
 * A member's three-leg travel plan for an event, denormalized onto the roster so the
 * boarding-pass view renders in the single attendance request. Only meaningful for a
 * `going` member; retained (but hidden) if they later switch to `interested`.
 */
export const travelPlanSchema = z.object({
  outboundTransport: travelLegSchema,
  lodging: travelLegSchema,
  returnTransport: travelLegSchema,
});
export type TravelPlan = z.infer<typeof travelPlanSchema>;

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
  travel: travelPlanSchema,
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
  interested: z.number().int(),
});
export type AttendanceSummary = z.infer<typeof attendanceSummarySchema>;

/**
 * A single event with its full detail: prose description plus an attendance summary,
 * so the event view renders in one request.
 */
export const eventDetailSchema = eventSummarySchema.extend({
  description: z.string(),
  attendanceSummary: attendanceSummarySchema,
});
export type EventDetail = z.infer<typeof eventDetailSchema>;

/** Cursor-paginated response for `GET /api/events`. */
export const eventListResponseSchema = z.object({
  data: z.array(eventSummarySchema),
  nextCursor: z.string().nullable(),
});
export type EventListResponse = z.infer<typeof eventListResponseSchema>;
