import { Injectable, NotFoundException } from "@nestjs/common";

import {
  errorCode,
  type Notification,
  type NotificationListQuery,
  type NotificationListResponse,
  type NotificationType,
} from "@teambrewer/shared";

import { decodeKeysetCursor, encodeKeysetCursor } from "../common/keyset-cursor.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";

/** The persisted notification row (with its originating comment + author) this service maps. */
interface NotificationRow {
  id: string;
  type: string;
  subjectType: string;
  subjectId: string;
  commentId: string | null;
  readAt: Date | null;
  createdAt: Date;
  comment: { author: { id: string; username: string | null; displayName: string } } | null;
}

/**
 * The recipient's in-app notification center (docs/features/collaboration-core.md;
 * no email/push — ADR-0003). Every notification is team-scoped (via
 * {@link TeamScopedPrisma}) and further scoped to the acting user, so a member
 * only ever reads or clears their own. A notification a caller does not own is
 * indistinguishable from a missing one (→ 404, no enumeration).
 */
@Injectable()
export class NotificationService {
  constructor(private readonly scoped: TeamScopedPrisma) {}

  /** List the caller's notifications (newest-first, keyset-paginated) with the unread badge count. */
  async list(team: TeamContext, query: NotificationListQuery): Promise<NotificationListResponse> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;
    const rows = (await this.scoped.db.notification.findMany({
      where: {
        userId: team.userId,
        ...(query.unreadOnly ? { readAt: null } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.sortValue } },
                { createdAt: cursor.sortValue, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: {
        comment: {
          select: { author: { select: { id: true, username: true, displayName: true } } },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as NotificationRow[];

    const unreadCount = await this.scoped.db.notification.count({
      where: { userId: team.userId, readAt: null },
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(toNotification),
      unreadCount,
      nextCursor: hasMore && last ? encodeKeysetCursor(last.createdAt, last.id) : null,
    };
  }

  /** Mark one of the caller's notifications read (404 if not theirs or missing). */
  async markRead(team: TeamContext, notificationId: string): Promise<void> {
    const notification = await this.scoped.db.notification.findFirst({
      where: { id: notificationId, userId: team.userId },
    });
    if (!notification) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Notification not found." },
      });
    }
    await this.scoped.db.notification.updateMany({
      where: { id: notificationId, userId: team.userId },
      data: { readAt: new Date() },
    });
  }

  /** Mark all of the caller's unread notifications read (clears the badge). */
  async markAllRead(team: TeamContext): Promise<void> {
    await this.scoped.db.notification.updateMany({
      where: { userId: team.userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

function toNotification(row: NotificationRow): Notification {
  const author = row.comment?.author ?? null;
  return {
    id: row.id,
    type: row.type as NotificationType,
    subjectType: row.subjectType as Notification["subjectType"],
    subjectId: row.subjectId,
    commentId: row.commentId,
    actor: author
      ? { userId: author.id, username: author.username ?? "", displayName: author.displayName }
      : null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
