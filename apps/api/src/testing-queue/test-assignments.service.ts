import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  type CreateTestAssignmentInput,
  errorCode,
  type TestAssignment,
  type TestAssignmentListQuery,
  type TestAssignmentListResponse,
  type TestAssignmentStatus,
  type UpdateTestAssignmentInput,
} from "@teambrewer/shared";

import { CollaborationActivityService } from "../collaboration/activity.service.js";
import { decodeKeysetCursor, encodeKeysetCursor } from "../common/keyset-cursor.js";
import { assertHeroInGame } from "../common/reference-data-guards.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";
import { canModifyAssignment } from "./assignment-authorization.js";
import { assertAssignmentStatusTransition } from "./assignment-status-transition.js";

/** A teammate's display identity, resolved for the assignment card. */
interface UserRow {
  id: string;
  username: string | null;
  displayName: string;
}

/** The persisted assignment shape (with its relations) this service maps to the contract. */
interface AssignmentRow {
  id: string;
  teamId: string;
  eventId: string | null;
  assigneeId: string;
  assignedById: string;
  deckId: string;
  opponentGauntletEntryId: string | null;
  opponentHeroId: string | null;
  opponentArchetypeLabel: string | null;
  opponentSnapshotLabel: string;
  targetGames: number | null;
  status: TestAssignmentStatus;
  notes: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignee: UserRow;
  assignedBy: UserRow;
  deck: { name: string };
}

/** The resolved opponent columns + the human snapshot label, ready to persist. */
interface ResolvedOpponent {
  opponentGauntletEntryId: string | null;
  opponentHeroId: string | null;
  opponentArchetypeLabel: string | null;
  opponentSnapshotLabel: string;
}

const ASSIGNMENT_INCLUDE = {
  assignee: { select: { id: true, username: true, displayName: true } },
  assignedBy: { select: { id: true, username: true, displayName: true } },
  deck: { select: { name: true } },
} as const;

/**
 * Team-scoped test assignments (docs/features/testing-queue.md §Test assignments) —
 * a matchup (our deck × an opponent target) handed to a member so the field's
 * bogeymen get piloted. Every query goes through {@link TeamScopedPrisma} so it is
 * filtered by the verified `teamId`; a cross-tenant id yields no row (→ 404, never
 * leaking existence). Any member may create/self-assign; the creator, the assignee,
 * or a team-admin may edit / transition / archive. The opponent is resolved once at
 * create time into a durable `opponentSnapshotLabel` so a later-deleted gauntlet
 * entry/hero still reads meaningfully.
 */
@Injectable()
export class TestAssignmentsService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly activity: CollaborationActivityService,
  ) {}

  /**
   * List the team's assignments with `eventId`/`assigneeId`/`deckId`/`status` filters
   * + keyset pagination (newest first). Archived assignments are excluded.
   */
  async list(query: TestAssignmentListQuery): Promise<TestAssignmentListResponse> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;

    const andClauses: Record<string, unknown>[] = [];
    if (query.eventId) andClauses.push({ eventId: query.eventId });
    if (query.assigneeId) andClauses.push({ assigneeId: query.assigneeId });
    if (query.deckId) andClauses.push({ deckId: query.deckId });
    if (query.status) andClauses.push({ status: query.status });
    if (cursor) {
      andClauses.push({
        OR: [
          { createdAt: { lt: cursor.sortValue } },
          { createdAt: cursor.sortValue, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = (await this.scoped.db.testAssignment.findMany({
      where: { archivedAt: null, ...(andClauses.length > 0 ? { AND: andClauses } : {}) },
      include: ASSIGNMENT_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as AssignmentRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(toTestAssignment),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.createdAt, last.id) : null,
    };
  }

  /**
   * Create/assign a test. Validates the assignee is a team member, our deck belongs
   * to the team, and the optional event belongs to the team; resolves the single
   * opponent target into its columns + snapshot label. Stamps `assignedById` from the
   * verified context.
   */
  async create(team: TeamContext, input: CreateTestAssignmentInput): Promise<TestAssignment> {
    await this.assertTeamMember(input.assigneeId);
    await this.assertTeamDeck(input.deckId);
    if (input.eventId !== undefined) {
      await this.assertEventInTeam(input.eventId);
    }
    const opponent = await this.resolveOpponent(team.gameId, input);

    const created = (await this.scoped.db.testAssignment.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps teamId);
        // never from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        assignedById: team.userId,
        assigneeId: input.assigneeId,
        deckId: input.deckId,
        eventId: input.eventId ?? null,
        opponentGauntletEntryId: opponent.opponentGauntletEntryId,
        opponentHeroId: opponent.opponentHeroId,
        opponentArchetypeLabel: opponent.opponentArchetypeLabel,
        opponentSnapshotLabel: opponent.opponentSnapshotLabel,
        targetGames: input.targetGames ?? null,
        notes: input.notes,
      },
    })) as AssignmentRow;

    await this.recordActivity(team, created.id, "test_assignment_created");
    return this.requireAssignment(created.id);
  }

  /**
   * Update an assignment. Only the creator, assignee, or a team-admin may (404 before
   * 403). The opponent target is immutable (rejected by the schema). A `status` change
   * is validated against the lifecycle; a new assignee must be a team member.
   */
  async update(
    team: TeamContext,
    assignmentId: string,
    input: UpdateTestAssignmentInput,
  ): Promise<TestAssignment> {
    const current = await this.loadModifiableAssignment(team, assignmentId);

    const data: Record<string, unknown> = {};
    if (input.assigneeId !== undefined) {
      await this.assertTeamMember(input.assigneeId);
      data["assigneeId"] = input.assigneeId;
    }
    if (input.targetGames !== undefined) data["targetGames"] = input.targetGames;
    if (input.notes !== undefined) data["notes"] = input.notes;

    const statusChanged = input.status !== undefined && input.status !== current.status;
    if (input.status !== undefined) {
      if (statusChanged) {
        assertAssignmentStatusTransition(current.status, input.status);
      }
      data["status"] = input.status;
    }

    await this.scoped.db.testAssignment.updateMany({ where: { id: assignmentId }, data });
    await this.recordActivity(
      team,
      assignmentId,
      statusChanged ? "test_assignment_status_changed" : "test_assignment_updated",
    );
    return this.requireAssignment(assignmentId);
  }

  /** Soft-delete (archive) an assignment; retained for history, dropped from lists. */
  async archive(team: TeamContext, assignmentId: string): Promise<void> {
    await this.loadModifiableAssignment(team, assignmentId);
    await this.scoped.db.testAssignment.updateMany({
      where: { id: assignmentId },
      data: { archivedAt: new Date() },
    });
  }

  /** Record an assignment lifecycle action on the team activity feed. */
  private async recordActivity(
    team: TeamContext,
    assignmentId: string,
    verb: "test_assignment_created" | "test_assignment_updated" | "test_assignment_status_changed",
  ): Promise<void> {
    await this.activity.recordActivity(team, {
      verb,
      subjectType: "test_assignment",
      subjectId: assignmentId,
    });
  }

  /** Load a non-archived assignment the acting member may modify, else 404 (before 403). */
  private async loadModifiableAssignment(
    team: TeamContext,
    assignmentId: string,
  ): Promise<AssignmentRow> {
    const row = await this.requireActiveAssignmentRow(assignmentId);
    if (!canModifyAssignment(team, row)) {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "Only the assignment's creator, its assignee, or a team-admin may change it.",
        },
      });
    }
    return row;
  }

  /** Read a non-archived assignment (team-scoped), or throw 404. */
  private async requireActiveAssignmentRow(assignmentId: string): Promise<AssignmentRow> {
    const row = (await this.scoped.db.testAssignment.findFirst({
      where: { id: assignmentId, archivedAt: null },
      include: ASSIGNMENT_INCLUDE,
    })) as AssignmentRow | null;
    if (!row) {
      throw assignmentNotFound();
    }
    return row;
  }

  /** Read + map an assignment after a write (throws 404 if it vanished). */
  private async requireAssignment(assignmentId: string): Promise<TestAssignment> {
    const row = await this.requireActiveAssignmentRow(assignmentId);
    return toTestAssignment(row);
  }

  /**
   * Resolve the single opponent target (already exactly-one-of by the schema) into its
   * persisted columns plus a human `opponentSnapshotLabel`. A gauntlet entry must
   * belong to the team (→ 422); a hero must belong to the team's game (→ 404). The
   * snapshot is derived once so a later-deleted entry/hero stays meaningful.
   */
  private async resolveOpponent(
    gameId: string,
    input: {
      opponentGauntletEntryId?: string | undefined;
      opponentHeroId?: string | undefined;
      opponentArchetypeLabel?: string | undefined;
    },
  ): Promise<ResolvedOpponent> {
    const empty: ResolvedOpponent = {
      opponentGauntletEntryId: null,
      opponentHeroId: null,
      opponentArchetypeLabel: null,
      opponentSnapshotLabel: "",
    };

    if (input.opponentGauntletEntryId !== undefined) {
      const entry = (await this.scoped.db.gauntletEntry.findFirst({
        where: { id: input.opponentGauntletEntryId },
        include: {
          referenceDeck: { select: { name: true } },
          hero: { select: { name: true } },
        },
      })) as {
        referenceDeck: { name: string } | null;
        hero: { name: string } | null;
        archetypeLabel: string | null;
      } | null;
      if (!entry) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "The gauntlet entry does not belong to this team.",
          },
        });
      }
      const label =
        entry.referenceDeck?.name ?? entry.hero?.name ?? entry.archetypeLabel ?? "Gauntlet target";
      return {
        ...empty,
        opponentGauntletEntryId: input.opponentGauntletEntryId,
        opponentSnapshotLabel: label,
      };
    }

    if (input.opponentHeroId !== undefined) {
      await assertHeroInGame(this.scoped.db, gameId, input.opponentHeroId);
      const hero = await this.scoped.db.hero.findFirst({
        where: { id: input.opponentHeroId },
        select: { name: true },
      });
      return {
        ...empty,
        opponentHeroId: input.opponentHeroId,
        opponentSnapshotLabel: hero?.name ?? "Hero",
      };
    }

    return {
      ...empty,
      opponentArchetypeLabel: input.opponentArchetypeLabel ?? null,
      opponentSnapshotLabel: input.opponentArchetypeLabel ?? "",
    };
  }

  /** Reject a `userId` that is not a member of the team (→ 422). */
  private async assertTeamMember(userId: string): Promise<void> {
    const membership = await this.scoped.db.teamMembership.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!membership) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "The assignee is not a member of this team.",
        },
      });
    }
  }

  /** Reject a `deckId` that does not belong to the team (cross-team FK → 422). */
  private async assertTeamDeck(deckId: string): Promise<void> {
    const deck = await this.scoped.db.deck.findFirst({
      where: { id: deckId },
      select: { id: true },
    });
    if (!deck) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "The deck does not belong to this team.",
        },
      });
    }
  }

  /** Reject an `eventId` that does not belong to the team (cross-team FK → 422). */
  private async assertEventInTeam(eventId: string): Promise<void> {
    const event = await this.scoped.db.event.findFirst({
      where: { id: eventId },
      select: { id: true },
    });
    if (!event) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "The event does not belong to this team.",
        },
      });
    }
  }
}

function assignmentNotFound(): NotFoundException {
  return new NotFoundException({
    error: { code: errorCode.notFound, message: "Test assignment not found." },
  });
}

function toTestAssignment(row: AssignmentRow): TestAssignment {
  return {
    id: row.id,
    eventId: row.eventId,
    assignee: {
      userId: row.assignee.id,
      username: row.assignee.username ?? "",
      displayName: row.assignee.displayName,
    },
    assignedBy: {
      userId: row.assignedBy.id,
      username: row.assignedBy.username ?? "",
      displayName: row.assignedBy.displayName,
    },
    deckId: row.deckId,
    deckName: row.deck.name,
    opponentGauntletEntryId: row.opponentGauntletEntryId,
    opponentHeroId: row.opponentHeroId,
    opponentArchetypeLabel: row.opponentArchetypeLabel,
    opponentSnapshotLabel: row.opponentSnapshotLabel,
    targetGames: row.targetGames,
    status: row.status,
    notes: row.notes,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
