import { randomUUID } from "node:crypto";

import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import { errorCode } from "@teambrewer/shared";

import { PrismaService } from "../prisma/prisma.service.js";
import { InviteTokenService } from "./invite-token.service.js";

const DISCORD_PROVIDER_ID = "discord";

export interface BindClaimInput {
  token: string;
  discordUserId: string;
  discordUsername: string;
}

export interface LinkIdentityInput {
  userId: string;
  discordUserId: string;
  discordUsername: string;
}

/**
 * Owns the rules that keep Discord a first-class but strictly invite-only login
 * method with exactly one login method per account (ADR-0009):
 *
 * - **Claim binding** (`bindClaim`): consuming a single-use `discord_link` token
 *   binds the returned Discord identity to a provisioned Discord account and
 *   creates the Better Auth `account` link that lets that user log in with
 *   Discord thereafter. `discordUserId` is globally unique.
 * - **Invite-only** (`resolveLoginUser`): a Discord identity with no linked,
 *   provisioned account resolves to nothing, so login is rejected (no
 *   auto-provisioning). Better Auth's `disableImplicitSignUp` is the second gate.
 * - **Method exclusivity**: only `discord` accounts may be bound for login; only
 *   `password_totp` accounts may attach an **identity-only** Discord link
 *   (`linkIdentityOnly`), which never creates an `account` link and so never
 *   grants Discord login.
 */
@Injectable()
export class DiscordAccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inviteTokens: InviteTokenService,
  ) {}

  /**
   * Consume a single-use invite/claim token (the unified `setup` invite, or a
   * legacy `discord_link` claim link) and bind the returned Discord identity to
   * the provisioned account, committing Discord as its login method. The token is
   * single-use even if binding fails afterwards (the admin regenerates it).
   */
  async bindClaim(input: BindClaimInput): Promise<{ userId: string }> {
    const consumed = await this.inviteTokens.consume(input.token, ["setup", "discord_link"]);
    if (!consumed.userId) {
      throw new UnprocessableEntityException({
        error: { code: errorCode.invalidToken, message: "This link is invalid or has expired." },
      });
    }
    await this.bindLoginIdentity(consumed.userId, input.discordUserId, input.discordUsername);
    return { userId: consumed.userId };
  }

  /**
   * Bind a Discord identity to an unclaimed account as its login identity,
   * committing `authMethod = "discord"` and creating the Better Auth `account`
   * link. The invitee chooses their method at claim time (ADR-0009), so this
   * accepts an account whose method is still the placeholder — but rejects one
   * that has already set a password (a claimed password account keeps its method;
   * one account, one method). Also rejects a Discord id already linked elsewhere.
   */
  async bindLoginIdentity(
    userId: string,
    discordUserId: string,
    discordUsername: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: { id: true, authMethod: true },
      });
      if (!user) {
        throw new NotFoundException({
          error: { code: errorCode.notFound, message: "Account not found." },
        });
      }
      const passwordCredential = await transaction.account.findFirst({
        where: { userId, providerId: "credential" },
        select: { id: true },
      });
      if (passwordCredential) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.loginMethodMismatch,
            message: "This account has already been set up with a password.",
          },
        });
      }

      const conflicting = await transaction.user.findUnique({
        where: { discordUserId },
        select: { id: true },
      });
      if (conflicting && conflicting.id !== userId) {
        throw new ConflictException({
          error: {
            code: errorCode.conflict,
            message: "This Discord account is already linked to another user.",
          },
        });
      }

      const existingLink = await transaction.account.findFirst({
        where: { userId, providerId: DISCORD_PROVIDER_ID },
        select: { id: true, accountId: true },
      });
      if (existingLink && existingLink.accountId !== discordUserId) {
        throw new ConflictException({
          error: {
            code: errorCode.conflict,
            message: "This account is already linked to a different Discord identity.",
          },
        });
      }

      await transaction.user.update({
        where: { id: userId },
        data: { authMethod: "discord", discordUserId, discordUsername },
      });
      if (!existingLink) {
        await transaction.account.create({
          data: {
            id: randomUUID(),
            userId,
            providerId: DISCORD_PROVIDER_ID,
            accountId: discordUserId,
          },
        });
      }
    });
  }

  /**
   * Resolve the account a Discord identity may log in as. Returns null when the
   * identity is not bound to a provisioned Discord account (invite-only: reject).
   * An identity-only link on a password account has no `account` row, so it never
   * resolves here — it cannot be used to log in.
   */
  async resolveLoginUser(discordUserId: string): Promise<{ id: string } | null> {
    const account = await this.prisma.account.findFirst({
      where: { providerId: DISCORD_PROVIDER_ID, accountId: discordUserId },
      select: { userId: true },
    });
    if (!account) {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: account.userId },
      select: { id: true, authMethod: true },
    });
    if (!user || user.authMethod !== "discord") {
      return null;
    }
    return { id: user.id };
  }

  /**
   * Attach an identity-only Discord link to a password account for
   * recognizability / @mention mapping. Never creates an `account` link, so it
   * does not grant Discord login (ADR-0009). Rejects Discord-login accounts and
   * a Discord id already in use.
   */
  async linkIdentityOnly(input: LinkIdentityInput): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: input.userId },
        select: { id: true, authMethod: true },
      });
      if (!user) {
        throw new NotFoundException({
          error: { code: errorCode.notFound, message: "Account not found." },
        });
      }
      if (user.authMethod !== "password_totp") {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.loginMethodMismatch,
            message: "Only password accounts can link a Discord identity.",
          },
        });
      }

      const conflicting = await transaction.user.findUnique({
        where: { discordUserId: input.discordUserId },
        select: { id: true },
      });
      if (conflicting && conflicting.id !== input.userId) {
        throw new ConflictException({
          error: {
            code: errorCode.conflict,
            message: "This Discord account is already linked to another user.",
          },
        });
      }

      await transaction.user.update({
        where: { id: input.userId },
        data: { discordUserId: input.discordUserId, discordUsername: input.discordUsername },
      });
    });
  }

  /** Remove a password account's identity-only Discord link. */
  async unlinkIdentity(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, authMethod: true },
    });
    if (!user) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Account not found." },
      });
    }
    if (user.authMethod !== "password_totp") {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.loginMethodMismatch,
          message: "This account uses Discord to log in; its identity cannot be unlinked here.",
        },
      });
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { discordUserId: null, discordUsername: null },
    });
  }
}
