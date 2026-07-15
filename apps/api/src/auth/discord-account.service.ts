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
 * - **Login methods**: the claim flow binds `discord` accounts for login; a
 *   `password_totp` account MAY additionally link a Discord identity
 *   (`linkIdentityOnly`), which creates a `discord` `account` row so that
 *   account can ALSO sign in with Discord (ADR-0011). A Discord-login account
 *   cannot add a password here.
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
   * Attach a Discord identity to a password account for recognizability /
   * @mention mapping, and grant it as an additional login method by
   * creating (or re-pointing) the Better Auth `account` link (ADR-0011): the
   * account can then log in with either its password + TOTP or Discord.
   * Rejects Discord-login accounts and a Discord id already in use.
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

      // Discord login is modelled by the account row Better Auth resolves on
      // social sign-in (ADR-0011). Create it (or re-point it) so linking grants
      // login in addition to the account's password + TOTP.
      const existingLink = await transaction.account.findFirst({
        where: { userId: input.userId, providerId: DISCORD_PROVIDER_ID },
        select: { id: true, accountId: true },
      });
      if (!existingLink) {
        await transaction.account.create({
          data: {
            id: randomUUID(),
            userId: input.userId,
            providerId: DISCORD_PROVIDER_ID,
            accountId: input.discordUserId,
          },
        });
      } else if (existingLink.accountId !== input.discordUserId) {
        await transaction.account.update({
          where: { id: existingLink.id },
          data: { accountId: input.discordUserId },
        });
      }
    });
  }

  /** Remove a password account's identity-only Discord link. */
  async unlinkIdentity(userId: string): Promise<void> {
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
      if (user.authMethod !== "password_totp") {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.loginMethodMismatch,
            message: "This account uses Discord to log in; its identity cannot be unlinked here.",
          },
        });
      }
      // Remove the Discord login account row (revokes Discord sign-in). The
      // password credential remains, so the account keeps a login method.
      await transaction.account.deleteMany({
        where: { userId, providerId: DISCORD_PROVIDER_ID },
      });
      await transaction.user.update({
        where: { id: userId },
        data: { discordUserId: null, discordUsername: null },
      });
    });
  }
}
