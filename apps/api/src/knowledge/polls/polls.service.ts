import { randomUUID } from "node:crypto";

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  type CreatePollInput,
  errorCode,
  type Poll,
  type PollListQuery,
  type PollListResponse,
  type PollOption,
  type PollOptionResult,
  type PollStatus,
  type PollVoteInput,
  type UpdatePollInput,
} from "@teambrewer/shared";

import { CollaborationActivityService } from "../../collaboration/activity.service.js";
import { decodeKeysetCursor, encodeKeysetCursor } from "../../common/keyset-cursor.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { TeamContext } from "../../tenancy/team-context.js";
import { TeamScopedPrisma } from "../../tenancy/team-scoped-prisma.js";
import { assertPollStatusTransition } from "./poll-status-transition.js";

/** A teammate's display identity, resolved for a poll's author. */
interface UserRow {
  id: string;
  username: string | null;
  displayName: string;
}

/** A persisted vote row. */
interface VoteRow {
  userId: string;
  optionId: string;
}

/** The persisted poll shape (with relations) this service maps to the contract. */
interface PollRow {
  id: string;
  authorId: string;
  question: string;
  options: unknown;
  status: PollStatus;
  closesAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: UserRow;
  votes: VoteRow[];
}

const POLL_INCLUDE = {
  author: { select: { id: true, username: true, displayName: true } },
  votes: { select: { userId: true, optionId: true } },
} as const;

/**
 * Team-scoped polls (docs/features/team-knowledge.md) — single-choice group votes. Every
 * query goes through {@link TeamScopedPrisma} so it is filtered by the verified `teamId`;
 * a cross-tenant id yields no row (→ 404). A poll is *effectively closed* once `closesAt`
 * passes even if its stored status is still `open`; voting is allowed only while
 * effectively open (else 422). Each member has at most one vote (upsert on
 * `(pollId, userId)`). The author or a team-admin may edit/close/reopen.
 */
@Injectable()
export class PollsService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly activity: CollaborationActivityService,
  ) {}

  /**
   * List the team's polls (newest first, keyset-paginated). `status` filters by
   * *effective* status (a poll past `closesAt` counts as closed).
   */
  async list(team: TeamContext, query: PollListQuery): Promise<PollListResponse> {
    const now = new Date();
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;

    const andClauses: Record<string, unknown>[] = [];
    if (query.status === "open") {
      andClauses.push({ status: "open", OR: [{ closesAt: null }, { closesAt: { gt: now } }] });
    } else if (query.status === "closed") {
      andClauses.push({ OR: [{ status: "closed" }, { closesAt: { lte: now } }] });
    }
    if (cursor) {
      andClauses.push({
        OR: [
          { createdAt: { lt: cursor.sortValue } },
          { createdAt: cursor.sortValue, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = (await this.scoped.db.poll.findMany({
      where: andClauses.length > 0 ? { AND: andClauses } : {},
      include: POLL_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as PollRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map((row) => toPoll(row, team.userId, now)),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.createdAt, last.id) : null,
    };
  }

  /** Read a single poll (team-scoped) with its tally, or 404. */
  async getPoll(team: TeamContext, pollId: string): Promise<Poll> {
    return toPoll(await this.requirePollRow(pollId), team.userId, new Date());
  }

  /**
   * Create a poll (any team member). Rejects a `closesAt` already in the past (→ 422),
   * assigns each option a stable id, starts `open`, and records `poll_created` activity.
   */
  async create(team: TeamContext, input: CreatePollInput): Promise<Poll> {
    if (input.closesAt !== undefined && new Date(input.closesAt).getTime() <= Date.now()) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "A poll's close time must be in the future.",
        },
      });
    }

    const options: PollOption[] = input.options.map((label) => ({ id: randomUUID(), label }));
    const created = await this.scoped.db.poll.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps teamId); never
        // from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        authorId: team.userId,
        question: input.question,
        options: options as unknown as Prisma.InputJsonValue,
        status: "open",
        closesAt: input.closesAt !== undefined ? new Date(input.closesAt) : null,
      },
      select: { id: true },
    });

    await this.activity.recordActivity(team, {
      verb: "poll_created",
      subjectType: "poll",
      subjectId: created.id,
    });
    return this.getPoll(team, created.id);
  }

  /**
   * Edit a poll (author or team-admin). `status` drives close/reopen (transition
   * validated; reopening a poll past its `closesAt` is rejected). Replacing `options` is
   * allowed only while the poll has no votes. Closing records `poll_closed` activity.
   */
  async update(team: TeamContext, pollId: string, input: UpdatePollInput): Promise<Poll> {
    const existing = await this.requirePollRow(pollId);
    if (existing.authorId !== team.userId && team.role !== "team_admin") {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "Only the author or a team-admin may edit this poll.",
        },
      });
    }

    const data: Record<string, unknown> = {};
    if (input.question !== undefined) data["question"] = input.question;

    if (input.closesAt !== undefined) {
      data["closesAt"] = input.closesAt === null ? null : new Date(input.closesAt);
    }

    if (input.options !== undefined) {
      if (existing.votes.length > 0) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "Options cannot be changed once votes have been cast.",
          },
        });
      }
      const options: PollOption[] = input.options.map((label) => ({ id: randomUUID(), label }));
      data["options"] = options as unknown as Prisma.InputJsonValue;
    }

    let closed = false;
    if (input.status !== undefined && input.status !== existing.status) {
      assertPollStatusTransition(existing.status, input.status);
      if (
        input.status === "open" &&
        existing.closesAt &&
        existing.closesAt.getTime() <= Date.now()
      ) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "A poll whose close time has passed cannot be reopened.",
          },
        });
      }
      data["status"] = input.status;
      closed = input.status === "closed";
    }

    await this.scoped.db.poll.updateMany({ where: { id: pollId }, data });

    if (closed) {
      await this.activity.recordActivity(team, {
        verb: "poll_closed",
        subjectType: "poll",
        subjectId: pollId,
      });
    }
    return this.getPoll(team, pollId);
  }

  /**
   * Cast or change the caller's vote. Rejects a vote on an effectively-closed poll (→
   * 422) and an `optionId` that is not one of the poll's options (→ 422). One vote per
   * member (upsert on `(pollId, userId)`).
   */
  async vote(team: TeamContext, pollId: string, input: PollVoteInput): Promise<Poll> {
    const poll = await this.requirePollRow(pollId);
    this.assertVotable(poll);

    const options = parseOptions(poll.options);
    if (!options.some((option) => option.id === input.optionId)) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "That option does not belong to this poll.",
        },
      });
    }

    await this.scoped.db.pollVote.upsert({
      where: { pollId_userId: { pollId, userId: team.userId } },
      create: { pollId, userId: team.userId, optionId: input.optionId },
      update: { optionId: input.optionId },
    });
    return this.getPoll(team, pollId);
  }

  /** Retract the caller's vote. Rejected on an effectively-closed poll (→ 422). */
  async retractVote(team: TeamContext, pollId: string): Promise<Poll> {
    const poll = await this.requirePollRow(pollId);
    this.assertVotable(poll);
    await this.scoped.db.pollVote.deleteMany({ where: { pollId, userId: team.userId } });
    return this.getPoll(team, pollId);
  }

  /** Reject a vote/retraction on an effectively-closed poll (→ 422). */
  private assertVotable(poll: PollRow): void {
    if (effectiveStatus(poll.status, poll.closesAt, new Date()) === "closed") {
      throw new UnprocessableEntityException({
        error: { code: errorCode.domainRuleViolation, message: "This poll is closed." },
      });
    }
  }

  /** Read a poll (team-scoped), or throw 404. */
  private async requirePollRow(pollId: string): Promise<PollRow> {
    const row = (await this.scoped.db.poll.findFirst({
      where: { id: pollId },
      include: POLL_INCLUDE,
    })) as PollRow | null;
    if (!row) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Poll not found." },
      });
    }
    return row;
  }
}

/** The effective status of a poll: closed once its `closesAt` has passed. */
function effectiveStatus(status: PollStatus, closesAt: Date | null, now: Date): PollStatus {
  if (status === "open" && closesAt && closesAt.getTime() <= now.getTime()) {
    return "closed";
  }
  return status;
}

/** Parse the stored JSON options into the ordered `{ id, label }` list. */
function parseOptions(options: unknown): PollOption[] {
  return Array.isArray(options) ? (options as PollOption[]) : [];
}

/** Compute the per-option tally from the poll's votes. */
function computeResults(options: PollOption[], votes: VoteRow[]): PollOptionResult[] {
  const totalVotes = votes.length;
  return options.map((option) => {
    const count = votes.filter((vote) => vote.optionId === option.id).length;
    return {
      optionId: option.id,
      label: option.label,
      count,
      percentage: totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0,
    };
  });
}

function toPoll(row: PollRow, callerUserId: string, now: Date): Poll {
  const options = parseOptions(row.options);
  const results = computeResults(options, row.votes);
  const myVote = row.votes.find((vote) => vote.userId === callerUserId);
  return {
    id: row.id,
    authorId: row.authorId,
    author: {
      userId: row.author.id,
      username: row.author.username ?? "",
      displayName: row.author.displayName,
    },
    question: row.question,
    options,
    status: effectiveStatus(row.status, row.closesAt, now),
    closesAt: row.closesAt ? row.closesAt.toISOString() : null,
    results,
    totalVotes: row.votes.length,
    myVoteOptionId: myVote?.optionId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
