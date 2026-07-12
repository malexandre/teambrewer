import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";

import {
  type Attendance,
  type AttendanceStatus,
  type AttendanceSummary,
  type CreateEventInput,
  type CreateGauntletEntryInput,
  type EventDetail,
  type EventImportance,
  type EventListQuery,
  type EventListResponse,
  type EventStatus,
  type EventSummary,
  errorCode,
  type GauntletEntry,
  type GauntletEntryList,
  type SetAttendanceInput,
  type UpdateEventInput,
  type UpdateGauntletEntryInput,
} from "@teambrewer/shared";

import { CollaborationActivityService } from "../collaboration/activity.service.js";
import { decodeKeysetCursor, encodeKeysetCursor } from "../common/keyset-cursor.js";
import { assertFormatInGame, assertHeroInGame } from "../common/reference-data-guards.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";
import { assertEventStatusTransition } from "./event-status-transition.js";

/** The persisted event shape this service maps to the shared contracts. */
interface EventRow {
  id: string;
  teamId: string;
  name: string;
  formatId: string;
  date: Date;
  location: string | null;
  importance: EventImportance;
  description: string;
  status: EventStatus;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface GauntletEntryRow {
  id: string;
  eventId: string;
  referenceDeckId: string | null;
  heroId: string | null;
  archetypeLabel: string | null;
  expectedMetaShare: number;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

interface AttendanceRow {
  id: string;
  eventId: string;
  userId: string;
  status: AttendanceStatus;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; username: string | null; displayName: string };
}

interface EventDetailRow extends EventRow {
  gauntletEntries: GauntletEntryRow[];
  attendances: AttendanceRow[];
}

/** Gauntlet entries surface highest-share first (the field, sorted by prominence). */
const GAUNTLET_ORDER = [{ expectedMetaShare: "desc" as const }, { createdAt: "asc" as const }];

/**
 * Team-scoped events, gauntlets, and attendance (docs/features/events-and-gauntlets.md,
 * ADR-0004). Every event/gauntlet query goes through {@link TeamScopedPrisma} so it
 * is filtered by the verified `teamId`; a cross-tenant id simply yields no row
 * (→ 404, never leaking existence). Attendance carries no `teamId` and is reached
 * only through its team-scoped parent event. Permissions are a shared team board:
 * any verified team member may create/edit/delete any event or gauntlet entry, so
 * there is no per-resource ownership check beyond membership.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly activity: CollaborationActivityService,
  ) {}

  /**
   * List the team's events with filters + keyset pagination (most recently dated
   * first). No `team` argument is needed: {@link TeamScopedPrisma} injects the
   * verified `teamId` into every query from the request context, and events have no
   * per-member visibility rules (a shared team board).
   */
  async list(query: EventListQuery): Promise<EventListResponse> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;

    const andClauses: Record<string, unknown>[] = [];
    if (cursor) {
      andClauses.push({
        OR: [{ date: { lt: cursor.sortValue } }, { date: cursor.sortValue, id: { lt: cursor.id } }],
      });
    }

    const rows = (await this.scoped.db.event.findMany({
      where: {
        archivedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.formatId ? { formatId: query.formatId } : {}),
        ...(query.importance ? { importance: query.importance } : {}),
        ...(andClauses.length > 0 ? { AND: andClauses } : {}),
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as EventRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(toEventSummary),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.date, last.id) : null,
    };
  }

  /** A single event with its gauntlet + attendance summary (404 when missing/cross-tenant/archived). */
  async getEvent(eventId: string): Promise<EventDetail> {
    const row = await this.findEventDetail(eventId, { includeArchived: false });
    if (!row) {
      throw eventNotFound();
    }
    return toEventDetail(row);
  }

  /** Create an event; stamps teamId from context and starts it at `upcoming`. */
  async create(team: TeamContext, input: CreateEventInput): Promise<EventDetail> {
    await assertFormatInGame(this.scoped.db, team.gameId, input.formatId);

    const created = (await this.scoped.db.event.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps the same
        // teamId); never from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        name: input.name,
        formatId: input.formatId,
        date: new Date(input.date),
        location: input.location ?? null,
        importance: input.importance,
        description: input.description,
      },
    })) as EventRow;

    await this.recordEventActivity(team, created.id, "event_created");
    return this.requireEventDetail(created.id, { includeArchived: false });
  }

  /**
   * Update an event's fields and/or advance its status (validated transition).
   * Unlike decks, status changes come through this endpoint; moving to `archived`
   * stamps `archivedAt` (soft-delete).
   */
  async update(team: TeamContext, eventId: string, input: UpdateEventInput): Promise<EventDetail> {
    const current = await this.requireEvent(eventId);

    if (input.formatId !== undefined) {
      await assertFormatInGame(this.scoped.db, team.gameId, input.formatId);
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data["name"] = input.name;
    if (input.formatId !== undefined) data["formatId"] = input.formatId;
    if (input.date !== undefined) data["date"] = new Date(input.date);
    if (input.location !== undefined) data["location"] = input.location;
    if (input.importance !== undefined) data["importance"] = input.importance;
    if (input.description !== undefined) data["description"] = input.description;
    if (input.status !== undefined) {
      assertEventStatusTransition(current.status, input.status);
      data["status"] = input.status;
      if (input.status === "archived") {
        data["archivedAt"] = new Date();
      }
    }

    await this.scoped.db.event.updateMany({ where: { id: eventId }, data });
    // A status advance is a distinct feed verb from a plain field edit.
    await this.recordEventActivity(
      team,
      eventId,
      input.status !== undefined ? "event_status_changed" : "event_updated",
    );
    // Include archived so a status advance to `archived` still returns the event.
    return this.requireEventDetail(eventId, { includeArchived: true });
  }

  /** Soft-delete (archive) an event; history survives, it leaves default lists. */
  async archive(eventId: string): Promise<void> {
    await this.requireEvent(eventId);
    await this.scoped.db.event.updateMany({
      where: { id: eventId },
      data: { status: "archived", archivedAt: new Date() },
    });
  }

  /** An event's gauntlet (all entries), highest expected share first. */
  async listGauntletEntries(eventId: string): Promise<GauntletEntryList> {
    await this.requireEvent(eventId);
    const entries = (await this.scoped.db.gauntletEntry.findMany({
      where: { eventId },
      orderBy: GAUNTLET_ORDER,
    })) as GauntletEntryRow[];
    return { data: entries.map(toGauntletEntry) };
  }

  /** Add a gauntlet entry (exactly one target form; target must be valid + unique in the event). */
  async addGauntletEntry(
    team: TeamContext,
    eventId: string,
    input: CreateGauntletEntryInput,
  ): Promise<GauntletEntry> {
    await this.requireEvent(eventId);
    const target = await this.resolveGauntletTarget(eventId, input, team.gameId);

    const created = (await this.scoped.db.gauntletEntry.create({
      data: {
        eventId,
        // Stamped from context; the same teamId TeamScopedPrisma re-stamps.
        teamId: team.teamId,
        referenceDeckId: target.referenceDeckId,
        heroId: target.heroId,
        archetypeLabel: target.archetypeLabel,
        expectedMetaShare: input.expectedMetaShare,
        notes: input.notes,
      },
    })) as GauntletEntryRow;
    return toGauntletEntry(created);
  }

  /** Update a gauntlet entry's share/notes (the target form is immutable). */
  async updateGauntletEntry(
    eventId: string,
    gauntletEntryId: string,
    input: UpdateGauntletEntryInput,
  ): Promise<GauntletEntry> {
    await this.requireEvent(eventId);
    await this.requireGauntletEntry(eventId, gauntletEntryId);

    const data: Record<string, unknown> = {};
    if (input.expectedMetaShare !== undefined) data["expectedMetaShare"] = input.expectedMetaShare;
    if (input.notes !== undefined) data["notes"] = input.notes;

    await this.scoped.db.gauntletEntry.updateMany({ where: { id: gauntletEntryId }, data });
    const updated = (await this.scoped.db.gauntletEntry.findFirst({
      where: { id: gauntletEntryId },
    })) as GauntletEntryRow;
    return toGauntletEntry(updated);
  }

  /** Remove a gauntlet entry (hard delete — entries are not soft-deleted). */
  async removeGauntletEntry(eventId: string, gauntletEntryId: string): Promise<void> {
    await this.requireEvent(eventId);
    await this.requireGauntletEntry(eventId, gauntletEntryId);
    await this.scoped.db.gauntletEntry.deleteMany({ where: { id: gauntletEntryId } });
  }

  /** The event's attendance roster (every member's RSVP). */
  async listAttendance(eventId: string): Promise<{ data: Attendance[] }> {
    await this.requireEvent(eventId);
    // Attendance carries no teamId; it is reached only through the team-scoped
    // event we just verified, so filtering by eventId is the tenant boundary.
    const rows = (await this.scoped.db.attendance.findMany({
      where: { eventId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    })) as AttendanceRow[];
    return { data: rows.map(toAttendance) };
  }

  /** Set the current member's RSVP (idempotent upsert — one row per (event, user)). */
  async setMyAttendance(
    team: TeamContext,
    eventId: string,
    input: SetAttendanceInput,
  ): Promise<Attendance> {
    await this.requireEvent(eventId);
    const row = (await this.scoped.db.attendance.upsert({
      where: { eventId_userId: { eventId, userId: team.userId } },
      create: { eventId, userId: team.userId, status: input.status },
      update: { status: input.status },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    })) as AttendanceRow;
    return toAttendance(row);
  }

  /**
   * Record an event lifecycle action on the team activity feed. Events have no
   * private visibility (a shared team board), so — unlike decks — every event is
   * team-visible and always recorded.
   */
  private async recordEventActivity(
    team: TeamContext,
    eventId: string,
    verb: "event_created" | "event_updated" | "event_status_changed",
  ): Promise<void> {
    await this.activity.recordActivity(team, {
      verb,
      subjectType: "event",
      subjectId: eventId,
    });
  }

  /** Load a non-archived event's id + current status, or throw 404. */
  private async requireEvent(eventId: string): Promise<{ id: string; status: EventStatus }> {
    const row = (await this.scoped.db.event.findFirst({
      where: { id: eventId, archivedAt: null },
      select: { id: true, status: true },
    })) as { id: string; status: EventStatus } | null;
    if (!row) {
      throw eventNotFound();
    }
    return row;
  }

  /** Load a gauntlet entry that belongs to the event, or throw 404. */
  private async requireGauntletEntry(eventId: string, gauntletEntryId: string): Promise<void> {
    const row = await this.scoped.db.gauntletEntry.findFirst({
      where: { id: gauntletEntryId, eventId },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Gauntlet entry not found." },
      });
    }
  }

  /** Read an event's full detail row (with gauntlet + attendance), honoring archived visibility. */
  private async findEventDetail(
    eventId: string,
    options: { includeArchived: boolean },
  ): Promise<EventDetailRow | null> {
    const row = (await this.scoped.db.event.findFirst({
      where: { id: eventId },
      include: {
        gauntletEntries: { orderBy: GAUNTLET_ORDER },
        attendances: {
          include: { user: { select: { id: true, username: true, displayName: true } } },
        },
      },
    })) as EventDetailRow | null;
    if (!row) {
      return null;
    }
    if (!options.includeArchived && row.archivedAt !== null) {
      return null;
    }
    return row;
  }

  /** Like {@link findEventDetail} but throws 404 when absent (used after a write). */
  private async requireEventDetail(
    eventId: string,
    options: { includeArchived: boolean },
  ): Promise<EventDetail> {
    const row = await this.findEventDetail(eventId, options);
    if (!row) {
      throw eventNotFound();
    }
    return toEventDetail(row);
  }

  /**
   * Validate and normalize a gauntlet entry's single target form: a reference deck
   * must be one of the team's own reference decks; a hero must be in the team's
   * game; and no matching target may already exist in the event (→ 422).
   */
  private async resolveGauntletTarget(
    eventId: string,
    input: CreateGauntletEntryInput,
    gameId: string,
  ): Promise<{
    referenceDeckId: string | null;
    heroId: string | null;
    archetypeLabel: string | null;
  }> {
    if (input.referenceDeckId !== undefined) {
      const deck = await this.scoped.db.deck.findFirst({
        where: { id: input.referenceDeckId, isReference: true, archivedAt: null },
        select: { id: true },
      });
      if (!deck) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "The referenced deck is not a reference deck for this team.",
          },
        });
      }
      await this.assertNoDuplicateTarget(eventId, { referenceDeckId: input.referenceDeckId });
      return { referenceDeckId: input.referenceDeckId, heroId: null, archetypeLabel: null };
    }

    if (input.heroId !== undefined) {
      await assertHeroInGame(this.scoped.db, gameId, input.heroId);
      await this.assertNoDuplicateTarget(eventId, { heroId: input.heroId });
      return { referenceDeckId: null, heroId: input.heroId, archetypeLabel: null };
    }

    const archetypeLabel = input.archetypeLabel as string;
    await this.assertNoDuplicateTarget(eventId, {
      archetypeLabel: { equals: archetypeLabel, mode: "insensitive" },
    });
    return { referenceDeckId: null, heroId: null, archetypeLabel };
  }

  /** Reject a target already present in the event's gauntlet (→ 422). */
  private async assertNoDuplicateTarget(
    eventId: string,
    targetWhere: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.scoped.db.gauntletEntry.findFirst({
      where: { eventId, ...targetWhere },
      select: { id: true },
    });
    if (existing) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "This target is already in the event's gauntlet.",
        },
      });
    }
  }
}

function eventNotFound(): NotFoundException {
  return new NotFoundException({
    error: { code: errorCode.notFound, message: "Event not found." },
  });
}

function toEventSummary(event: EventRow): EventSummary {
  return {
    id: event.id,
    name: event.name,
    formatId: event.formatId,
    date: event.date.toISOString(),
    location: event.location,
    importance: event.importance,
    status: event.status,
    archivedAt: event.archivedAt ? event.archivedAt.toISOString() : null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function toEventDetail(event: EventDetailRow): EventDetail {
  return {
    ...toEventSummary(event),
    description: event.description,
    gauntletEntries: event.gauntletEntries.map(toGauntletEntry),
    attendanceSummary: summarizeAttendance(event.attendances),
  };
}

function toGauntletEntry(entry: GauntletEntryRow): GauntletEntry {
  return {
    id: entry.id,
    eventId: entry.eventId,
    referenceDeckId: entry.referenceDeckId,
    heroId: entry.heroId,
    archetypeLabel: entry.archetypeLabel,
    expectedMetaShare: entry.expectedMetaShare,
    notes: entry.notes,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function toAttendance(row: AttendanceRow): Attendance {
  return {
    id: row.id,
    eventId: row.eventId,
    status: row.status,
    user: {
      userId: row.user.id,
      username: row.user.username ?? "",
      displayName: row.user.displayName,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function summarizeAttendance(rows: { status: AttendanceStatus }[]): AttendanceSummary {
  const summary: AttendanceSummary = { going: 0, maybe: 0, notGoing: 0 };
  for (const row of rows) {
    if (row.status === "going") summary.going += 1;
    else if (row.status === "maybe") summary.maybe += 1;
    else summary.notGoing += 1;
  }
  return summary;
}
