import { Injectable, NotFoundException } from "@nestjs/common";

import {
  type Attendance,
  type AttendanceList,
  type AttendanceStatus,
  type AttendanceSummary,
  type CreateEventInput,
  type EventDetail,
  type EventListQuery,
  type EventListResponse,
  type EventSummary,
  errorCode,
  type SetAttendanceInput,
  type UpdateEventInput,
} from "@teambrewer/shared";

import { decodeKeysetCursor, encodeKeysetCursor } from "../common/keyset-cursor.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";

/** The persisted event shape this service maps to the shared contracts. */
interface EventRow {
  id: string;
  teamId: string;
  name: string;
  gameId: string;
  metaId: string | null;
  date: Date;
  location: string | null;
  description: string;
  archivedAt: Date | null;
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
  attendances: AttendanceRow[];
}

/**
 * Team-scoped events + attendance (docs/features/events-and-gauntlets.md). After the
 * meta-pivot redesign an event is a lightweight social board item: a name, date,
 * optional venue/description, and an optional link to a meta, plus per-member RSVP.
 * Every event query goes through {@link TeamScopedPrisma} so it is filtered by the
 * verified `teamId`; a cross-tenant id simply yields no row (→ 404, never leaking
 * existence). Attendance carries no `teamId` and is reached only through its
 * team-scoped parent event. Permissions are a shared team board: any verified team
 * member may create/edit/delete any event, so there is no per-resource ownership
 * check beyond membership.
 */
@Injectable()
export class EventsService {
  constructor(private readonly scoped: TeamScopedPrisma) {}

  /**
   * List the team's events with an optional `metaId` filter + keyset pagination (most
   * recently dated first). {@link TeamScopedPrisma} injects the verified `teamId`;
   * events have no per-member visibility rules (a shared team board).
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
        ...(query.metaId ? { metaId: query.metaId } : {}),
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

  /** A single event with its attendance summary (404 when missing/cross-tenant/archived). */
  async getEvent(eventId: string): Promise<EventDetail> {
    const row = await this.findEventDetail(eventId, { includeArchived: false });
    if (!row) {
      throw eventNotFound();
    }
    return toEventDetail(row);
  }

  /** Create an event; stamps teamId/gameId from context and validates an optional meta link. */
  async create(team: TeamContext, input: CreateEventInput): Promise<EventDetail> {
    if (input.metaId !== undefined) {
      await this.assertMetaInTeam(input.metaId);
    }

    const created = (await this.scoped.db.event.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps the same
        // teamId); never from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        gameId: team.gameId,
        name: input.name,
        metaId: input.metaId ?? null,
        date: new Date(input.date),
        location: input.location ?? null,
        description: input.description,
      },
    })) as EventRow;

    return this.requireEventDetail(created.id, { includeArchived: false });
  }

  /** Update an event's fields. `location`/`metaId: null` clears the field. */
  async update(eventId: string, input: UpdateEventInput): Promise<EventDetail> {
    await this.requireEvent(eventId);

    if (input.metaId !== undefined && input.metaId !== null) {
      await this.assertMetaInTeam(input.metaId);
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data["name"] = input.name;
    if (input.date !== undefined) data["date"] = new Date(input.date);
    if (input.location !== undefined) data["location"] = input.location;
    if (input.description !== undefined) data["description"] = input.description;
    if (input.metaId !== undefined) data["metaId"] = input.metaId;

    await this.scoped.db.event.updateMany({ where: { id: eventId }, data });
    return this.requireEventDetail(eventId, { includeArchived: false });
  }

  /** Soft-delete (archive) an event; history survives, it leaves default lists. */
  async archive(eventId: string): Promise<void> {
    await this.requireEvent(eventId);
    await this.scoped.db.event.updateMany({
      where: { id: eventId },
      data: { archivedAt: new Date() },
    });
  }

  /** The event's attendance roster (every member's RSVP). */
  async listAttendance(eventId: string): Promise<AttendanceList> {
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

  /** Load a non-archived event's id, or throw 404. */
  private async requireEvent(eventId: string): Promise<void> {
    const row = await this.scoped.db.event.findFirst({
      where: { id: eventId, archivedAt: null },
      select: { id: true },
    });
    if (!row) {
      throw eventNotFound();
    }
  }

  /** Reject a `metaId` that does not belong to the team (cross-team → 404, no enumeration). */
  private async assertMetaInTeam(metaId: string): Promise<void> {
    const meta = await this.scoped.db.meta.findFirst({
      where: { id: metaId },
      select: { id: true },
    });
    if (!meta) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Meta not found." },
      });
    }
  }

  /** Read an event's full detail row (with attendance), honoring archived visibility. */
  private async findEventDetail(
    eventId: string,
    options: { includeArchived: boolean },
  ): Promise<EventDetailRow | null> {
    const row = (await this.scoped.db.event.findFirst({
      where: { id: eventId },
      include: {
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
    gameId: event.gameId,
    metaId: event.metaId,
    date: event.date.toISOString(),
    location: event.location,
    archivedAt: event.archivedAt ? event.archivedAt.toISOString() : null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function toEventDetail(event: EventDetailRow): EventDetail {
  return {
    ...toEventSummary(event),
    description: event.description,
    attendanceSummary: summarizeAttendance(event.attendances),
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
  const summary: AttendanceSummary = { going: 0, interested: 0 };
  for (const row of rows) {
    if (row.status === "going") summary.going += 1;
    else summary.interested += 1;
  }
  return summary;
}
