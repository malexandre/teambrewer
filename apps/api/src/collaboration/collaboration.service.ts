import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  type Comment,
  type CommentThreadQuery,
  type CommentThreadResponse,
  type CreateCommentInput,
  errorCode,
  parseMentionHandles,
  type UpdateCommentInput,
} from "@teambrewer/shared";

import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";
import { CollaborationActivityService } from "./activity.service.js";
import { canModifyComment } from "./comment-authorization.js";
import { SubjectResolverRegistry } from "./subject-resolver.js";

/** The persisted comment row (with its author) this service maps to the shared contract. */
interface CommentRow {
  id: string;
  subjectType: string;
  subjectId: string;
  body: string;
  parentCommentId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; username: string | null; displayName: string };
}

const AUTHOR_SELECT = { select: { id: true, username: true, displayName: true } } as const;

/**
 * Polymorphic, threaded comments on any attachable subject
 * (docs/features/collaboration-core.md). Every query goes through
 * {@link TeamScopedPrisma}, so a comment is always filtered by the verified
 * `teamId`; the subject is resolved + authorized through the
 * {@link SubjectResolverRegistry} so collaboration never depends on the owning
 * module. `@handle` mentions in a body resolve to in-team members and produce
 * notifications; commenting records team activity.
 */
@Injectable()
export class CollaborationService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly registry: SubjectResolverRegistry,
    private readonly activity: CollaborationActivityService,
  ) {}

  /** The threaded comments for a subject (404 if the caller cannot see the subject). */
  async listThread(team: TeamContext, query: CommentThreadQuery): Promise<CommentThreadResponse> {
    await this.registry.requireSubject(team, query.subjectType, query.subjectId);

    const rows = (await this.scoped.db.comment.findMany({
      where: { subjectType: query.subjectType, subjectId: query.subjectId },
      include: { author: AUTHOR_SELECT },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })) as CommentRow[];

    const repliesByParent = new Map<string, CommentRow[]>();
    for (const row of rows) {
      if (row.parentCommentId) {
        const siblings = repliesByParent.get(row.parentCommentId) ?? [];
        siblings.push(row);
        repliesByParent.set(row.parentCommentId, siblings);
      }
    }

    const data = rows
      .filter((row) => row.parentCommentId === null)
      .map((row) => toComment(row, repliesByParent.get(row.id) ?? []));
    return { data };
  }

  /** Post a comment (or a reply) on a subject; parses mentions and records activity. */
  async create(team: TeamContext, input: CreateCommentInput): Promise<Comment> {
    const subject = await this.registry.requireSubject(team, input.subjectType, input.subjectId);
    if (!subject.canComment) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "This subject is archived and can no longer be commented on.",
        },
      });
    }

    // Single-level threading: a reply to a reply attaches to the same top-level
    // parent (collaboration-core.md "threading"). The parent must belong to the
    // same subject (and, via the scoped client, the same team).
    let parentCommentId: string | null = null;
    if (input.parentCommentId) {
      const parent = (await this.scoped.db.comment.findFirst({
        where: {
          id: input.parentCommentId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
        },
        include: { author: AUTHOR_SELECT },
      })) as CommentRow | null;
      if (!parent || parent.archivedAt !== null) {
        throw new NotFoundException({
          error: { code: errorCode.notFound, message: "Parent comment not found." },
        });
      }
      parentCommentId = parent.parentCommentId ?? parent.id;
    }

    const created = (await this.scoped.db.comment.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps the same
        // value; the explicit field satisfies Prisma's create typing).
        teamId: team.teamId,
        authorId: team.userId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        body: input.body,
        parentCommentId,
      },
      include: { author: AUTHOR_SELECT },
    })) as CommentRow;

    await this.syncMentions(team, created.id, input.body, input.subjectType, input.subjectId);
    if (subject.isTeamVisible) {
      await this.activity.recordActivity(team, {
        verb: "commented",
        subjectType: input.subjectType,
        subjectId: input.subjectId,
      });
    }

    return toComment(created, []);
  }

  /** Edit a comment's body (author or team-admin); re-resolves mentions (adds new only). */
  async update(team: TeamContext, commentId: string, input: UpdateCommentInput): Promise<Comment> {
    const comment = await this.loadModifiableComment(team, commentId);
    await this.scoped.db.comment.updateMany({
      where: { id: commentId },
      data: { body: input.body },
    });
    await this.syncMentions(team, comment.id, input.body, comment.subjectType, comment.subjectId);

    const updated = (await this.scoped.db.comment.findFirst({
      where: { id: commentId },
      include: { author: AUTHOR_SELECT },
    })) as CommentRow | null;
    if (!updated) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Comment not found." },
      });
    }
    const replies = (await this.scoped.db.comment.findMany({
      where: { parentCommentId: commentId },
      include: { author: AUTHOR_SELECT },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })) as CommentRow[];
    return toComment(updated, replies);
  }

  /** Soft-delete (archive) a comment (author or team-admin); the thread structure survives. */
  async archive(team: TeamContext, commentId: string): Promise<void> {
    await this.loadModifiableComment(team, commentId);
    await this.scoped.db.comment.updateMany({
      where: { id: commentId },
      data: { archivedAt: new Date() },
    });
  }

  /** Load a live comment the caller may modify: 404 if missing/archived, 403 if not author/admin. */
  private async loadModifiableComment(team: TeamContext, commentId: string): Promise<CommentRow> {
    const comment = (await this.scoped.db.comment.findFirst({
      where: { id: commentId },
      include: { author: AUTHOR_SELECT },
    })) as (CommentRow & { author: { id: string } }) | null;
    if (!comment || comment.archivedAt !== null) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Comment not found." },
      });
    }
    if (!canModifyComment(team, { authorId: comment.author.id })) {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "You can only edit or remove your own comments.",
        },
      });
    }
    return comment;
  }

  /**
   * Resolve the `@handle` mentions in a body to in-team members and create a
   * Mention + Notification for each newly-mentioned member. A self-mention, a
   * non-member handle, and another team's user resolve to nothing (no
   * notification, no leak); an already-notified member is not notified again so
   * an edit does not duplicate (collaboration-core.md "editing a comment").
   */
  private async syncMentions(
    team: TeamContext,
    commentId: string,
    body: string,
    subjectType: string,
    subjectId: string,
  ): Promise<void> {
    const handles = parseMentionHandles(body);
    if (handles.length === 0) {
      return;
    }

    // Only members of the acting team resolve (teamId is injected by the scoped
    // client), so a handle for another team's user simply matches nothing.
    const memberships = await this.scoped.db.teamMembership.findMany({
      where: { user: { username: { in: handles } } },
      select: { userId: true },
    });
    const mentionedUserIds = memberships
      .map((membership) => membership.userId)
      .filter((userId) => userId !== team.userId);
    if (mentionedUserIds.length === 0) {
      return;
    }

    const existing = await this.scoped.db.mention.findMany({
      where: { commentId },
      select: { mentionedUserId: true },
    });
    const alreadyMentioned = new Set(existing.map((mention) => mention.mentionedUserId));

    for (const mentionedUserId of mentionedUserIds) {
      if (alreadyMentioned.has(mentionedUserId)) {
        continue;
      }
      await this.scoped.db.mention.create({ data: { commentId, mentionedUserId } });
      await this.scoped.db.notification.create({
        data: {
          // Stamped from the verified context (TeamScopedPrisma re-stamps the same
          // value; the explicit field satisfies Prisma's create typing).
          teamId: team.teamId,
          userId: mentionedUserId,
          type: "mention",
          subjectType,
          subjectId,
          commentId,
        },
      });
    }
  }
}

function toComment(row: CommentRow, replies: CommentRow[]): Comment {
  return {
    ...toNode(row),
    replies: replies.map(toNode),
  };
}

function toNode(row: CommentRow): Comment["replies"][number] {
  return {
    id: row.id,
    subjectType: row.subjectType as Comment["subjectType"],
    subjectId: row.subjectId,
    author: {
      userId: row.author.id,
      username: row.author.username ?? "",
      displayName: row.author.displayName,
    },
    // A soft-deleted comment's body is withheld; the node is kept so the thread
    // structure survives and the UI renders it as "removed".
    body: row.archivedAt !== null ? "" : row.body,
    parentCommentId: row.parentCommentId,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
