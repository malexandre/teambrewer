import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import {
  type CreateRetrospectiveInput,
  errorCode,
  type Retrospective,
  type UpdateRetrospectiveInput,
} from "@teambrewer/shared";

import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";

/** A teammate's display identity, resolved for the retrospective. */
interface UserRow {
  id: string;
  username: string | null;
  displayName: string;
}

/** The persisted retrospective shape (with its author) this service maps to the contract. */
interface RetrospectiveRow {
  id: string;
  eventId: string;
  authorId: string;
  body: string;
  resultsSummary: string;
  learnings: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: UserRow;
}

const RETROSPECTIVE_INCLUDE = {
  author: { select: { id: true, username: true, displayName: true } },
} as const;

/**
 * Team-scoped post-event retrospective (docs/features/gameplans-and-deck-selection.md
 * §Retrospective). Carries `teamId` and is team-scoped by construction, but every call
 * also verifies the parent event belongs to the team. There is one retrospective per
 * event (a second create → 409). Any member authors; the author or a team-admin edits;
 * only a team-admin archives.
 */
@Injectable()
export class RetrospectivesService {
  constructor(private readonly scoped: TeamScopedPrisma) {}

  /** The event's retrospective, or 404 if none has been written. */
  async getForEvent(eventId: string): Promise<Retrospective> {
    await this.requireEvent(eventId);
    const row = (await this.scoped.db.retrospective.findFirst({
      where: { eventId, archivedAt: null },
      include: RETROSPECTIVE_INCLUDE,
    })) as RetrospectiveRow | null;
    if (!row) {
      throw retrospectiveNotFound();
    }
    return toRetrospective(row);
  }

  /**
   * Write the event's retrospective (any member). Stamps `teamId`/`authorId` from the
   * verified context. Exactly one per event — a second create is a 409.
   */
  async create(
    team: TeamContext,
    eventId: string,
    input: CreateRetrospectiveInput,
  ): Promise<Retrospective> {
    await this.requireEvent(eventId);
    const existing = await this.scoped.db.retrospective.findFirst({
      where: { eventId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        error: {
          code: errorCode.conflict,
          message: "This event already has a retrospective. Edit it instead of creating a new one.",
        },
      });
    }

    const created = await this.scoped.db.retrospective.create({
      data: {
        teamId: team.teamId,
        eventId,
        authorId: team.userId,
        body: input.body,
        resultsSummary: input.resultsSummary,
        learnings: input.learnings,
      },
      select: { id: true },
    });
    return this.getById(eventId, created.id);
  }

  /**
   * Update the retrospective. Content edits are allowed to the author or a team-admin;
   * archiving (`archived: true`) is team-admin only. 404 before 403.
   */
  async update(
    team: TeamContext,
    eventId: string,
    retrospectiveId: string,
    input: UpdateRetrospectiveInput,
  ): Promise<Retrospective> {
    await this.requireEvent(eventId);
    const current = await this.requireRetrospective(eventId, retrospectiveId);

    const isAuthor = current.authorId === team.userId;
    const isAdmin = team.role === "team_admin";
    if (!isAuthor && !isAdmin) {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "Only the retrospective's author or a team-admin may edit it.",
        },
      });
    }
    if (input.archived !== undefined && !isAdmin) {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "Only a team-admin may archive a retrospective.",
        },
      });
    }

    const data: Record<string, unknown> = {};
    if (input.body !== undefined) data["body"] = input.body;
    if (input.resultsSummary !== undefined) data["resultsSummary"] = input.resultsSummary;
    if (input.learnings !== undefined) data["learnings"] = input.learnings;
    if (input.archived !== undefined) data["archivedAt"] = input.archived ? new Date() : null;

    await this.scoped.db.retrospective.updateMany({ where: { id: retrospectiveId }, data });
    return this.getById(eventId, retrospectiveId);
  }

  /** Read + map a retrospective by id after a write. */
  private async getById(eventId: string, retrospectiveId: string): Promise<Retrospective> {
    return toRetrospective(await this.requireRetrospective(eventId, retrospectiveId));
  }

  /** Load a retrospective that belongs to the event (any archived state), or throw 404. */
  private async requireRetrospective(
    eventId: string,
    retrospectiveId: string,
  ): Promise<RetrospectiveRow> {
    const row = (await this.scoped.db.retrospective.findFirst({
      where: { id: retrospectiveId, eventId },
      include: RETROSPECTIVE_INCLUDE,
    })) as RetrospectiveRow | null;
    if (!row) {
      throw retrospectiveNotFound();
    }
    return row;
  }

  /** Verify the parent event belongs to the team, or 404. */
  private async requireEvent(eventId: string): Promise<void> {
    const event = await this.scoped.db.event.findFirst({
      where: { id: eventId, archivedAt: null },
      select: { id: true },
    });
    if (!event) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Event not found." },
      });
    }
  }
}

function retrospectiveNotFound(): NotFoundException {
  return new NotFoundException({
    error: { code: errorCode.notFound, message: "Retrospective not found." },
  });
}

function toRetrospective(row: RetrospectiveRow): Retrospective {
  return {
    id: row.id,
    eventId: row.eventId,
    author: {
      userId: row.author.id,
      username: row.author.username ?? "",
      displayName: row.author.displayName,
    },
    body: row.body,
    resultsSummary: row.resultsSummary,
    learnings: row.learnings,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
