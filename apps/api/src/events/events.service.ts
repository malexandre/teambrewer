import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";

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
  type SetTravelInput,
  type TravelLeg,
  type TravelLegInput,
  type TravelLegStatus,
  type TravelPlan,
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
  outboundTransportStatus: TravelLegStatus | null;
  outboundTransportDetail: string | null;
  lodgingStatus: TravelLegStatus | null;
  lodgingDetail: string | null;
  returnTransportStatus: TravelLegStatus | null;
  returnTransportDetail: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; username: string | null; displayName: string };
}

interface EventDetailRow extends EventRow {
  attendances: AttendanceRow[];
}

/**
 * Team-scoped events + attendance (docs/features/events-and-gauntlets.md). After the
 * meta-pivot redesign an event is a lightweight, isolated social board item: a name,
 * date, optional venue/description, plus per-member RSVP.
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
   * List the team's events with keyset pagination (most recently dated first).
   * {@link TeamScopedPrisma} injects the verified `teamId`; events have no per-member
   * visibility rules (a shared team board).
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
        ...(andClauses.length > 0 ? { AND: andClauses } : {}),
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as EventRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);

    const attendanceCounts = await this.countAttendanceByStatus(page.map((event) => event.id));
    return {
      data: page.map((event) =>
        toEventSummary(event, attendanceCounts.get(event.id) ?? emptyAttendanceCounts()),
      ),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.date, last.id) : null,
    };
  }

  /**
   * Tally each event's RSVPs by status in a single grouped count over the page's
   * events — never one query per row. Attendance carries no `teamId`; the event ids
   * come from the team-scoped list above, so filtering by them is the tenant
   * boundary. Returns a map from event id to its going/interested counts.
   */
  private async countAttendanceByStatus(
    eventIds: string[],
  ): Promise<Map<string, AttendanceCounts>> {
    const countsByEvent = new Map<string, AttendanceCounts>();
    if (eventIds.length === 0) {
      return countsByEvent;
    }

    const grouped = await this.scoped.db.attendance.groupBy({
      by: ["eventId", "status"],
      where: { eventId: { in: eventIds } },
      _count: { _all: true },
    });

    for (const group of grouped) {
      const counts = countsByEvent.get(group.eventId) ?? emptyAttendanceCounts();
      if (group.status === "going") counts.goingCount = group._count._all;
      else counts.interestedCount = group._count._all;
      countsByEvent.set(group.eventId, counts);
    }
    return countsByEvent;
  }

  /** A single event with its attendance summary (404 when missing/cross-tenant/archived). */
  async getEvent(eventId: string): Promise<EventDetail> {
    const row = await this.findEventDetail(eventId, { includeArchived: false });
    if (!row) {
      throw eventNotFound();
    }
    return toEventDetail(row);
  }

  /** Create an event; stamps teamId/gameId from the verified context. */
  async create(team: TeamContext, input: CreateEventInput): Promise<EventDetail> {
    const created = (await this.scoped.db.event.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps the same
        // teamId); never from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        gameId: team.gameId,
        name: input.name,
        date: new Date(input.date),
        location: input.location ?? null,
        description: input.description,
      },
    })) as EventRow;

    return this.requireEventDetail(created.id, { includeArchived: false });
  }

  /** Update an event's fields. `location: null` clears the field. */
  async update(eventId: string, input: UpdateEventInput): Promise<EventDetail> {
    await this.requireEvent(eventId);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data["name"] = input.name;
    if (input.date !== undefined) data["date"] = new Date(input.date);
    if (input.location !== undefined) data["location"] = input.location;
    if (input.description !== undefined) data["description"] = input.description;

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

  /**
   * Replace the current member's three-leg travel plan for an event (self-service, one
   * row per (event, user)). Travel logistics are only meaningful for a member who is
   * attending, so this requires an existing `going` RSVP (422 otherwise). Each leg's
   * free-text detail is dropped unless that leg's status is `sorted`, so a stale note
   * can't linger on a "not needed"/"searching" leg.
   */
  async setMyTravel(
    team: TeamContext,
    eventId: string,
    input: SetTravelInput,
  ): Promise<Attendance> {
    await this.requireEvent(eventId);
    // Attendance carries no teamId; the eventId was just verified against the caller's
    // team, so scoping by (eventId, userId) is the tenant boundary.
    const existing = await this.scoped.db.attendance.findFirst({
      where: { eventId, userId: team.userId },
      select: { status: true },
    });
    if (!existing || existing.status !== "going") {
      throw travelRequiresGoing();
    }

    const row = (await this.scoped.db.attendance.update({
      where: { eventId_userId: { eventId, userId: team.userId } },
      data: {
        outboundTransportStatus: input.outboundTransport.status,
        outboundTransportDetail: detailForStatus(input.outboundTransport),
        lodgingStatus: input.lodging.status,
        lodgingDetail: detailForStatus(input.lodging),
        returnTransportStatus: input.returnTransport.status,
        returnTransportDetail: detailForStatus(input.returnTransport),
      },
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

function travelRequiresGoing(): UnprocessableEntityException {
  return new UnprocessableEntityException({
    error: {
      code: errorCode.domainRuleViolation,
      message: "RSVP as going before planning travel.",
    },
  });
}

/** A leg's detail note is only kept when it is `sorted`; a blank note stores as null. */
function detailForStatus(leg: TravelLegInput): string | null {
  if (leg.status !== "sorted") {
    return null;
  }
  const detail = leg.detail?.trim() ?? "";
  return detail.length > 0 ? detail : null;
}

function toTravelLeg(status: TravelLegStatus | null, detail: string | null): TravelLeg {
  return { status, detail };
}

function toTravelPlan(row: AttendanceRow): TravelPlan {
  return {
    outboundTransport: toTravelLeg(row.outboundTransportStatus, row.outboundTransportDetail),
    lodging: toTravelLeg(row.lodgingStatus, row.lodgingDetail),
    returnTransport: toTravelLeg(row.returnTransportStatus, row.returnTransportDetail),
  };
}

/** The going/interested RSVP tally embedded in an event summary row. */
interface AttendanceCounts {
  goingCount: number;
  interestedCount: number;
}

function emptyAttendanceCounts(): AttendanceCounts {
  return { goingCount: 0, interestedCount: 0 };
}

function toEventSummary(event: EventRow, counts: AttendanceCounts): EventSummary {
  return {
    id: event.id,
    name: event.name,
    gameId: event.gameId,
    date: event.date.toISOString(),
    location: event.location,
    goingCount: counts.goingCount,
    interestedCount: counts.interestedCount,
    archivedAt: event.archivedAt ? event.archivedAt.toISOString() : null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

function toEventDetail(event: EventDetailRow): EventDetail {
  const attendanceSummary = summarizeAttendance(event.attendances);
  return {
    ...toEventSummary(event, {
      goingCount: attendanceSummary.going,
      interestedCount: attendanceSummary.interested,
    }),
    description: event.description,
    attendanceSummary,
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
    travel: toTravelPlan(row),
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
