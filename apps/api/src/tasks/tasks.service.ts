import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  type CreateTaskInput,
  errorCode,
  type Task,
  type TaskListQuery,
  type TaskListResponse,
  type TaskStatus,
  type UpdateTaskInput,
} from "@teambrewer/shared";

import { CollaborationActivityService } from "../collaboration/activity.service.js";
import { decodeKeysetCursor, encodeKeysetCursor } from "../common/keyset-cursor.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";
import { canModifyTask, isSelfAssignmentOnly } from "./task-authorization.js";
import { assertReportPresent, assertTaskStatusTransition } from "./task-status-transition.js";

/** A teammate's display identity, resolved for a task row. */
interface UserRow {
  id: string;
  username: string | null;
  displayName: string;
}

/** The persisted task shape (with its relations) this service maps to the contract. */
interface TaskRow {
  id: string;
  teamId: string;
  authorId: string;
  title: string;
  description: string;
  deckId: string | null;
  status: TaskStatus;
  assigneeId: string | null;
  report: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: UserRow;
  assignee: UserRow | null;
  deck: { name: string } | null;
  votes: { userId: string }[];
}

const TASK_INCLUDE = {
  author: { select: { id: true, username: true, displayName: true } },
  assignee: { select: { id: true, username: true, displayName: true } },
  deck: { select: { name: true } },
  votes: { select: { userId: true } },
} as const;

/**
 * Team-scoped tasks (docs/features/tasks.md, ADR-0010) — the single free-form unit
 * of testing work that merges the old CardTestSuggestion + TestAssignment. Every
 * query goes through {@link TeamScopedPrisma} so it is filtered by the verified
 * `teamId`; a cross-tenant id yields no row (→ 404, never leaking existence). Any
 * member may create, upvote, and self-assign; the author, the current assignee, or a
 * team-admin may edit / advance / archive. Finishing a task demands a report so the
 * outcome is durable. Linked cards live inline in `description` as `+[[cardId]]`
 * tokens (stored verbatim; resolved to chips at render time — no FK table).
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly activity: CollaborationActivityService,
  ) {}

  /**
   * List the team's tasks with `deckId`/`assigneeId`/`status` filters + keyset
   * pagination (newest first). Archived tasks are excluded. Each row carries its
   * vote tally and whether the requesting member has upvoted.
   */
  async list(team: TeamContext, query: TaskListQuery): Promise<TaskListResponse> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;

    const andClauses: Record<string, unknown>[] = [];
    if (query.deckId) andClauses.push({ deckId: query.deckId });
    if (query.assigneeId) andClauses.push({ assigneeId: query.assigneeId });
    if (query.status) andClauses.push({ status: query.status });
    if (cursor) {
      andClauses.push({
        OR: [
          { createdAt: { lt: cursor.sortValue } },
          { createdAt: cursor.sortValue, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = (await this.scoped.db.task.findMany({
      where: { archivedAt: null, ...(andClauses.length > 0 ? { AND: andClauses } : {}) },
      include: TASK_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as TaskRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map((row) => toTask(row, team.userId)),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.createdAt, last.id) : null,
    };
  }

  /** A single task's detail (404 when missing/cross-tenant/archived). */
  async getTask(team: TeamContext, taskId: string): Promise<Task> {
    return this.requireTask(team, taskId);
  }

  /**
   * Create a task. Any member may. An optional `deckId` must belong to the team
   * (else 404, no enumeration); an optional `assigneeId` must be a team member (→
   * 422). Stamps `authorId` from the verified context; `status` starts `proposed`.
   */
  async create(team: TeamContext, input: CreateTaskInput): Promise<Task> {
    if (input.deckId !== undefined) {
      await this.assertTeamDeck(input.deckId);
    }
    if (input.assigneeId !== undefined) {
      await this.assertTeamMember(input.assigneeId);
    }

    const created = (await this.scoped.db.task.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps teamId);
        // never from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        authorId: team.userId,
        title: input.title,
        description: input.description,
        deckId: input.deckId ?? null,
        assigneeId: input.assigneeId ?? null,
      },
    })) as TaskRow;

    await this.recordActivity(team, created.id, "task_created");
    return this.requireTask(team, created.id);
  }

  /**
   * Update a task. The author, the current assignee, or a team-admin may edit any
   * field (404 before 403); any other member may only self-assign (assign it to
   * themselves and nothing else). A `status` change is validated against the
   * lifecycle and, when finishing, requires a report (merged from the input and the
   * stored row). Clearing `deckId`/`assigneeId` with `null` is allowed.
   */
  async update(team: TeamContext, taskId: string, input: UpdateTaskInput): Promise<Task> {
    const current = await this.requireActiveTaskRow(taskId);
    if (!canModifyTask(team, current) && !isSelfAssignmentOnly(team, input)) {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "Only the task's author, its assignee, or a team-admin may change it.",
        },
      });
    }

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data["title"] = input.title;
    if (input.description !== undefined) data["description"] = input.description;
    if (input.report !== undefined) data["report"] = input.report;

    if (input.deckId !== undefined) {
      if (input.deckId !== null) {
        await this.assertTeamDeck(input.deckId);
      }
      data["deckId"] = input.deckId;
    }
    if (input.assigneeId !== undefined) {
      if (input.assigneeId !== null) {
        await this.assertTeamMember(input.assigneeId);
      }
      data["assigneeId"] = input.assigneeId;
    }

    const statusChanged = input.status !== undefined && input.status !== current.status;
    if (input.status !== undefined) {
      if (statusChanged) {
        assertTaskStatusTransition(current.status, input.status);
      }
      const mergedReport = input.report ?? current.report;
      assertReportPresent(input.status, mergedReport);
      data["status"] = input.status;
    }

    await this.scoped.db.task.updateMany({ where: { id: taskId }, data });
    await this.recordActivity(team, taskId, statusChanged ? "task_status_changed" : "task_updated");
    return this.requireTask(team, taskId);
  }

  /** Soft-delete (archive) a task; retained for history, dropped from lists. */
  async archive(team: TeamContext, taskId: string): Promise<void> {
    await this.loadModifiableTask(team, taskId);
    await this.scoped.db.task.updateMany({
      where: { id: taskId },
      data: { archivedAt: new Date() },
    });
  }

  /**
   * Cast (or re-affirm) the requesting member's upvote — idempotent: repeated calls
   * keep exactly one row per member. The vote is reached only through its
   * team-scoped parent task, verified visible + active first.
   */
  async castVote(team: TeamContext, taskId: string): Promise<Task> {
    await this.requireActiveTaskRow(taskId);
    await this.scoped.db.taskVote.upsert({
      where: { taskId_userId: { taskId, userId: team.userId } },
      create: { taskId, userId: team.userId },
      update: {},
    });
    return this.requireTask(team, taskId);
  }

  /** Retract the requesting member's upvote (no-op if they had not voted). */
  async retractVote(team: TeamContext, taskId: string): Promise<void> {
    await this.requireActiveTaskRow(taskId);
    await this.scoped.db.taskVote.deleteMany({ where: { taskId, userId: team.userId } });
  }

  /** Record a task lifecycle action on the team activity feed. */
  private async recordActivity(
    team: TeamContext,
    taskId: string,
    verb: "task_created" | "task_updated" | "task_status_changed",
  ): Promise<void> {
    await this.activity.recordActivity(team, {
      verb,
      subjectType: "task",
      subjectId: taskId,
    });
  }

  /** Load a non-archived task the acting member may modify, else 404 (before 403). */
  private async loadModifiableTask(team: TeamContext, taskId: string): Promise<TaskRow> {
    const row = await this.requireActiveTaskRow(taskId);
    if (!canModifyTask(team, row)) {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "Only the task's author, its assignee, or a team-admin may change it.",
        },
      });
    }
    return row;
  }

  /** Read a non-archived task (team-scoped), or throw 404. */
  private async requireActiveTaskRow(taskId: string): Promise<TaskRow> {
    const row = (await this.scoped.db.task.findFirst({
      where: { id: taskId, archivedAt: null },
      include: TASK_INCLUDE,
    })) as TaskRow | null;
    if (!row) {
      throw taskNotFound();
    }
    return row;
  }

  /** Read + map a task after a write (throws 404 if it vanished). */
  private async requireTask(team: TeamContext, taskId: string): Promise<Task> {
    const row = await this.requireActiveTaskRow(taskId);
    return toTask(row, team.userId);
  }

  /** Reject a `deckId` that does not belong to the team (→ 404, no enumeration). */
  private async assertTeamDeck(deckId: string): Promise<void> {
    const deck = await this.scoped.db.deck.findFirst({
      where: { id: deckId },
      select: { id: true },
    });
    if (!deck) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Deck not found for this team." },
      });
    }
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
}

function taskNotFound(): NotFoundException {
  return new NotFoundException({
    error: { code: errorCode.notFound, message: "Task not found." },
  });
}

function toTaskUser(user: UserRow): Task["author"] {
  return {
    userId: user.id,
    username: user.username ?? "",
    displayName: user.displayName,
  };
}

function toTask(row: TaskRow, viewerUserId: string): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    deckId: row.deckId,
    deckName: row.deck?.name ?? null,
    author: toTaskUser(row.author),
    assignee: row.assignee ? toTaskUser(row.assignee) : null,
    status: row.status,
    report: row.report,
    voteCount: row.votes.length,
    viewerHasVoted: row.votes.some((vote) => vote.userId === viewerUserId),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
