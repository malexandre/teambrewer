import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import {
  type CurrentUser,
  type MyTeamsResponse,
  type SessionList,
} from "@teambrewer/shared";

import { AuthService } from "../auth/auth.service.js";
import { DiscordAccountService } from "../auth/discord-account.service.js";
import { CurrentUser as Caller, type CurrentUserContext } from "../common/current-user.decorator.js";
import { RoleGuard } from "../common/role.guard.js";
import { MeService } from "./me.service.js";

/** Convert Express headers into the `Headers` object Better Auth expects. */
function toHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join("; "));
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }
  return headers;
}

/**
 * Self-service account endpoints. `@UseGuards(RoleGuard)` with no role decorator
 * means "any authenticated caller" (RoleGuard rejects an absent `userId` with
 * 401), so these require a session but no particular role.
 */
@Controller("me")
@UseGuards(RoleGuard)
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly authService: AuthService,
    private readonly discordAccounts: DiscordAccountService,
  ) {}

  @Get()
  getCurrentUser(@Caller() caller: CurrentUserContext): Promise<CurrentUser> {
    return this.me.getCurrentUser(caller.userId);
  }

  @Get("teams")
  async getMyTeams(@Caller() caller: CurrentUserContext): Promise<MyTeamsResponse> {
    return { data: await this.me.getMyTeams(caller.userId) };
  }

  @Get("sessions")
  async getSessions(
    @Caller() caller: CurrentUserContext,
    @Req() request: Request,
  ): Promise<SessionList> {
    const session = await this.authService.getSession(toHeaders(request));
    const currentSessionId = session?.session?.id ?? null;
    return { data: await this.me.getSessions(caller.userId, currentSessionId) };
  }

  @Delete("sessions/:sessionId")
  @HttpCode(204)
  revokeSession(
    @Caller() caller: CurrentUserContext,
    @Param("sessionId") sessionId: string,
  ): Promise<void> {
    return this.me.revokeSession(caller.userId, sessionId);
  }

  @Delete("discord/link")
  @HttpCode(204)
  unlinkDiscord(@Caller() caller: CurrentUserContext): Promise<void> {
    return this.discordAccounts.unlinkIdentity(caller.userId);
  }
}
