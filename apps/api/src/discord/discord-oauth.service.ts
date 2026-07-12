import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { errorCode } from "@teambrewer/shared";

import { DiscordAccountService } from "../auth/discord-account.service.js";
import { DISCORD_OAUTH_CLIENT, type DiscordOAuthClient } from "./discord-oauth.client.js";

export type DiscordFlowKind = "claim" | "link";

interface StatePayload {
  kind: DiscordFlowKind;
  /** The claim token (claim flow) or the acting user id (identity-link flow). */
  ref: string;
  nonce: string;
}

export interface StartedFlow {
  authorizeUrl: string;
  /** Opaque nonce to store in an httpOnly cookie and echo back on callback (CSRF). */
  nonce: string;
}

export interface CallbackResult {
  kind: DiscordFlowKind;
}

/** Cookie carrying the CSRF nonce across the Discord round-trip. */
export const DISCORD_STATE_COOKIE = "tb_discord_oauth";

/**
 * Custom Discord OAuth transport for the two flows Better Auth's social plugin
 * can't express against our pre-provisioned model: **claim** (bind a returned
 * Discord identity to a provisioned account) and identity-only **link** for a
 * password account. State integrity is an HMAC over the payload; CSRF binding is
 * a random nonce echoed from an httpOnly cookie. The account rules live in
 * {@link DiscordAccountService}; this only moves the identity across the redirect.
 */
@Injectable()
export class DiscordOAuthService {
  constructor(
    private readonly discordAccounts: DiscordAccountService,
    @Inject(DISCORD_OAUTH_CLIENT) private readonly client: DiscordOAuthClient,
  ) {}

  redirectUri(): string {
    const base = process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000";
    return `${base}/api/discord/callback`;
  }

  start(kind: DiscordFlowKind, ref: string): StartedFlow {
    const nonce = randomBytes(16).toString("base64url");
    const state = this.signState({ kind, ref, nonce });
    return { authorizeUrl: this.client.authorizeUrl(state, this.redirectUri()), nonce };
  }

  async handleCallback(input: {
    code: string;
    state: string;
    cookieNonce: string | undefined;
  }): Promise<CallbackResult> {
    const payload = this.verifyState(input.state);
    if (!input.cookieNonce || !safeEquals(payload.nonce, input.cookieNonce)) {
      throw new BadRequestException({
        error: {
          code: errorCode.validationFailed,
          message: "Invalid or expired Discord sign-in state.",
        },
      });
    }

    const profile = await this.client.exchangeCode(input.code, this.redirectUri());

    if (payload.kind === "claim") {
      await this.discordAccounts.bindClaim({
        token: payload.ref,
        discordUserId: profile.discordUserId,
        discordUsername: profile.discordUsername,
      });
    } else {
      await this.discordAccounts.linkIdentityOnly({
        userId: payload.ref,
        discordUserId: profile.discordUserId,
        discordUsername: profile.discordUsername,
      });
    }
    return { kind: payload.kind };
  }

  private secret(): string {
    const secret = process.env["BETTER_AUTH_SECRET"];
    if (!secret) {
      throw new Error("BETTER_AUTH_SECRET is not set; cannot sign Discord OAuth state.");
    }
    return secret;
  }

  private signState(payload: StatePayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", this.secret()).update(body).digest("base64url");
    return `${body}.${signature}`;
  }

  private verifyState(state: string): StatePayload {
    const [body, signature] = state.split(".");
    if (!body || !signature) {
      throw this.invalidState();
    }
    const expected = createHmac("sha256", this.secret()).update(body).digest("base64url");
    if (!safeEquals(signature, expected)) {
      throw this.invalidState();
    }
    try {
      const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
      if ((parsed.kind !== "claim" && parsed.kind !== "link") || !parsed.ref || !parsed.nonce) {
        throw this.invalidState();
      }
      return parsed;
    } catch {
      throw this.invalidState();
    }
  }

  private invalidState(): BadRequestException {
    return new BadRequestException({
      error: {
        code: errorCode.validationFailed,
        message: "Invalid or expired Discord sign-in state.",
      },
    });
  }
}

function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
