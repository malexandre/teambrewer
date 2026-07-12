import { Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { type NotificationListResponse, notificationListQuerySchema } from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { NotificationService } from "./notification.service.js";

/**
 * The caller's in-app notification center (docs/features/collaboration-core.md).
 * Guarded by {@link TeamContextGuard}; notifications are always the caller's own
 * within the verified team — one member can never read or clear another's.
 */
@Controller("notifications")
@UseGuards(TeamContextGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(
    @CurrentTeam() team: TeamContext,
    @Query() query: unknown,
  ): Promise<NotificationListResponse> {
    return this.notifications.list(team, notificationListQuerySchema.parse(query));
  }

  @Patch(":notificationId/read")
  @HttpCode(204)
  markRead(
    @CurrentTeam() team: TeamContext,
    @Param("notificationId") notificationId: string,
  ): Promise<void> {
    return this.notifications.markRead(team, notificationId);
  }

  @Post("read-all")
  @HttpCode(204)
  markAllRead(@CurrentTeam() team: TeamContext): Promise<void> {
    return this.notifications.markAllRead(team);
  }
}
