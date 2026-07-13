import { createHash, randomBytes } from "node:crypto";

import { BadRequestException, Injectable } from "@nestjs/common";

import { errorCode } from "@teambrewer/shared";

import type { InviteTokenPurpose } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Thrown when a setup/reset/claim token is unknown, expired, already used, or
 * superseded. Deliberately uniform so consumers cannot distinguish these cases
 * (no account/link enumeration — see security.md). Extends BadRequestException
 * so the error filter serialises it as a 400 `INVALID_TOKEN` envelope wherever
 * it surfaces.
 */
export class InvalidInviteTokenError extends BadRequestException {
  constructor() {
    super({
      error: { code: errorCode.invalidToken, message: "This link is invalid or has expired." },
    });
    this.name = "InvalidInviteTokenError";
  }
}

/** How long each kind of link stays valid (see accounts-and-auth.md). */
export const INVITE_TOKEN_TTL_MILLISECONDS: Record<InviteTokenPurpose, number> = {
  setup: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
  discord_link: 60 * 60 * 1000,
};

export interface IssuedInviteToken {
  /** The raw token — placed in the URL and never stored. Shown to the admin once. */
  rawToken: string;
  expiresAt: Date;
}

export interface ConsumedInviteToken {
  id: string;
  userId: string | null;
  teamId: string | null;
  purpose: InviteTokenPurpose;
}

/**
 * Issues and consumes the single-use, hashed, expiring links the no-email
 * onboarding/recovery flow depends on (ADR-0003). Only the SHA-256 hash of a
 * token is stored; a freshly issued link of a given purpose invalidates any
 * earlier unused link of the same purpose for that user.
 */
@Injectable()
export class InviteTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** SHA-256 is appropriate here: the token is 256 bits of CSPRNG entropy, not a password. */
  static hashToken(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
  }

  async issue(input: {
    userId: string | null;
    teamId?: string | null;
    purpose: InviteTokenPurpose;
    now?: Date;
  }): Promise<IssuedInviteToken> {
    const now = input.now ?? new Date();
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = InviteTokenService.hashToken(rawToken);
    const expiresAt = new Date(now.getTime() + INVITE_TOKEN_TTL_MILLISECONDS[input.purpose]);

    await this.prisma.$transaction(async (transaction) => {
      // Invalidate any earlier unused link of the same purpose for this user so
      // only the latest link works.
      if (input.userId) {
        await transaction.inviteToken.updateMany({
          where: { userId: input.userId, purpose: input.purpose, usedAt: null },
          data: { usedAt: now },
        });
      }
      await transaction.inviteToken.create({
        data: {
          userId: input.userId,
          teamId: input.teamId ?? null,
          purpose: input.purpose,
          tokenHash,
          expiresAt,
        },
      });
    });

    return { rawToken, expiresAt };
  }

  /**
   * Invalidate every outstanding (unused) link for a user, whatever the purpose —
   * an admin "revoke the invite/recovery link" action. Returns how many links were
   * invalidated (0 if none were outstanding). Idempotent.
   */
  async revoke(userId: string, now: Date = new Date()): Promise<number> {
    const result = await this.prisma.inviteToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
    return result.count;
  }

  /**
   * Non-consuming validity check for the claim page: returns the token's purpose
   * when it is currently usable (exists, unused, unexpired), else null. Never
   * discloses which account a token belongs to (no enumeration).
   */
  async inspect(
    rawToken: string,
    now: Date = new Date(),
  ): Promise<{ purpose: InviteTokenPurpose } | null> {
    const tokenHash = InviteTokenService.hashToken(rawToken);
    const token = await this.prisma.inviteToken.findUnique({
      where: { tokenHash },
      select: { purpose: true, usedAt: true, expiresAt: true },
    });
    if (!token || token.usedAt !== null || token.expiresAt.getTime() <= now.getTime()) {
      return null;
    }
    return { purpose: token.purpose };
  }

  /**
   * Validate and atomically consume a token. Marks it used in the same query
   * that checks it is unused, so a token cannot be redeemed twice under a race.
   * Any failure throws {@link InvalidInviteTokenError} (no enumeration).
   */
  async consume(
    rawToken: string,
    purpose: InviteTokenPurpose | InviteTokenPurpose[],
    now: Date = new Date(),
  ): Promise<ConsumedInviteToken> {
    const acceptedPurposes = Array.isArray(purpose) ? purpose : [purpose];
    const tokenHash = InviteTokenService.hashToken(rawToken);

    const consumed = await this.prisma.$transaction(async (transaction) => {
      const token = await transaction.inviteToken.findUnique({
        where: { tokenHash },
      });
      if (
        !token ||
        !acceptedPurposes.includes(token.purpose) ||
        token.usedAt !== null ||
        token.expiresAt.getTime() <= now.getTime()
      ) {
        return null;
      }
      const updated = await transaction.inviteToken.updateMany({
        where: { id: token.id, usedAt: null },
        data: { usedAt: now },
      });
      if (updated.count !== 1) {
        return null;
      }
      return token;
    });

    if (!consumed) {
      throw new InvalidInviteTokenError();
    }
    return {
      id: consumed.id,
      userId: consumed.userId,
      teamId: consumed.teamId,
      purpose: consumed.purpose,
    };
  }
}
