import {
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { CurrentUser, type CurrentUserContext } from "../common/current-user.decorator.js";
import { RoleGuard } from "../common/role.guard.js";
import { StrictRateLimit } from "../common/throttling.js";
import { DISCORD_STATE_COOKIE, DiscordOAuthService } from "./discord-oauth.service.js";

const STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

function webOrigin(): string {
  return process.env["WEB_ORIGIN"] ?? "http://localhost:5173";
}

function setStateCookie(response: Response, nonce: string): void {
  response.cookie(DISCORD_STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    maxAge: STATE_COOKIE_MAX_AGE_MS,
    path: "/",
  });
}

function readStateCookie(request: Request): string | undefined {
  const raw = request.headers.cookie;
  if (!raw) {
    return undefined;
  }
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === DISCORD_STATE_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}

/**
 * Discord OAuth transport for the claim and identity-link flows. Redirect-based,
 * so it lives outside `/api/auth/*` (owned by Better Auth) and outside the SPA.
 */
@Controller()
export class DiscordOAuthController {
  private readonly logger = new Logger(DiscordOAuthController.name);

  constructor(private readonly discordOAuth: DiscordOAuthService) {}

  /** Public: begin the claim flow for a `discord_link` token. */
  @Get("discord/claim/:token/start")
  @StrictRateLimit()
  claimStart(@Param("token") token: string, @Res() response: Response): void {
    const { authorizeUrl, nonce } = this.discordOAuth.start("claim", token);
    setStateCookie(response, nonce);
    response.redirect(authorizeUrl);
  }

  /** Authenticated: begin an identity-only link for a password account. */
  @Post("me/discord/link")
  @UseGuards(RoleGuard)
  @StrictRateLimit()
  linkStart(
    @CurrentUser() caller: CurrentUserContext,
    @Res({ passthrough: true }) response: Response,
  ): { authorizeUrl: string } {
    const { authorizeUrl, nonce } = this.discordOAuth.start("link", caller.userId);
    setStateCookie(response, nonce);
    return { authorizeUrl };
  }

  @Get("discord/callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const cookieNonce = readStateCookie(request);
    response.clearCookie(DISCORD_STATE_COOKIE, { path: "/" });
    try {
      if (!code || !state) {
        throw new Error("Missing Discord callback parameters.");
      }
      const { kind } = await this.discordOAuth.handleCallback({ code, state, cookieNonce });
      const target =
        kind === "claim"
          ? `${webOrigin()}/login?claimed=1`
          : `${webOrigin()}/settings?discordLinked=1`;
      response.redirect(target);
    } catch (error) {
      // No PII in the log; the user is redirected to a generic error state.
      this.logger.warn(`Discord callback rejected: ${error instanceof Error ? error.name : "unknown"}`);
      response.redirect(`${webOrigin()}/login?discordError=1`);
    }
  }
}
