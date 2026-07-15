import { randomUUID } from "node:crypto";

import { ConflictException, UnprocessableEntityException } from "@nestjs/common";
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient, createUser } from "../../test/factories.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { DiscordAccountService } from "./discord-account.service.js";
import { InvalidInviteTokenError, InviteTokenService } from "./invite-token.service.js";

describe("DiscordAccountService", () => {
  let prisma: PrismaClient;
  let inviteTokens: InviteTokenService;
  let service: DiscordAccountService;

  beforeEach(async () => {
    const resetClient: Client = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();

    prisma = createTestPrismaClient();
    inviteTokens = new InviteTokenService(prisma as unknown as PrismaService);
    service = new DiscordAccountService(prisma as unknown as PrismaService, inviteTokens);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function issueClaimToken(userId: string): Promise<string> {
    const { rawToken } = await inviteTokens.issue({ userId, purpose: "discord_link" });
    return rawToken;
  }

  async function discordLoginAccountId(userId: string): Promise<string | null> {
    const account = await prisma.account.findFirst({
      where: { userId, providerId: "discord" },
      select: { accountId: true },
    });
    return account?.accountId ?? null;
  }

  describe("bindClaim", () => {
    it("binds a Discord identity to a provisioned account and enables Discord login", async () => {
      const user = await createUser(prisma, { authMethod: "discord" });
      const token = await issueClaimToken(user.id);

      const result = await service.bindClaim({
        token,
        discordUserId: "discord-1001",
        discordUsername: "Alpha",
      });

      expect(result.userId).toBe(user.id);
      const stored = await prisma.user.findUnique({
        where: { id: user.id },
        select: { discordUserId: true, discordUsername: true },
      });
      expect(stored).toEqual({ discordUserId: "discord-1001", discordUsername: "Alpha" });

      // A login account link now exists, so a returning Discord login resolves.
      expect(await discordLoginAccountId(user.id)).toBe("discord-1001");
    });

    it("rejects an invalid or already-used claim token", async () => {
      const user = await createUser(prisma, { authMethod: "discord" });
      const token = await issueClaimToken(user.id);
      await service.bindClaim({ token, discordUserId: "discord-1002", discordUsername: "Beta" });

      await expect(
        service.bindClaim({ token, discordUserId: "discord-1002", discordUsername: "Beta" }),
      ).rejects.toBeInstanceOf(InvalidInviteTokenError);
    });

    it("rejects binding a Discord id that is already linked to another account", async () => {
      const first = await createUser(prisma, { authMethod: "discord", username: "disc_one" });
      const second = await createUser(prisma, { authMethod: "discord", username: "disc_two" });
      await service.bindClaim({
        token: await issueClaimToken(first.id),
        discordUserId: "discord-shared",
        discordUsername: "One",
      });

      await expect(
        service.bindClaim({
          token: await issueClaimToken(second.id),
          discordUserId: "discord-shared",
          discordUsername: "Two",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("claims an unclaimed account via the unified setup invite, committing Discord as the method", async () => {
      // Provisioned with the placeholder method and no password set yet.
      const user = await createUser(prisma, { authMethod: "password_totp" });
      const { rawToken } = await inviteTokens.issue({ userId: user.id, purpose: "setup" });

      const result = await service.bindClaim({
        token: rawToken,
        discordUserId: "discord-1500",
        discordUsername: "Chooser",
      });

      expect(result.userId).toBe(user.id);
      const stored = await prisma.user.findUnique({
        where: { id: user.id },
        select: { authMethod: true, discordUserId: true },
      });
      expect(stored).toEqual({ authMethod: "discord", discordUserId: "discord-1500" });
      expect(await discordLoginAccountId(user.id)).toBe("discord-1500");
    });

    it("rejects claiming with Discord once the account has set a password (one method per account)", async () => {
      const user = await createUser(prisma, { authMethod: "password_totp" });
      await prisma.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          providerId: "credential",
          accountId: user.id,
          password: "already-hashed",
        },
      });
      const { rawToken } = await inviteTokens.issue({ userId: user.id, purpose: "setup" });

      await expect(
        service.bindClaim({
          token: rawToken,
          discordUserId: "discord-1600",
          discordUsername: "Late",
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe("identity link/unlink for password accounts", () => {
    it("links a Discord identity and enables Discord login", async () => {
      const passwordUser = await createUser(prisma, { authMethod: "password_totp" });

      await service.linkIdentityOnly({
        userId: passwordUser.id,
        discordUserId: "discord-2001",
        discordUsername: "Identity",
      });

      const stored = await prisma.user.findUnique({
        where: { id: passwordUser.id },
        select: { discordUserId: true, discordUsername: true },
      });
      expect(stored).toEqual({ discordUserId: "discord-2001", discordUsername: "Identity" });
      // Linking now creates the Better Auth login account row (one user, two accounts).
      expect(await discordLoginAccountId(passwordUser.id)).toBe("discord-2001");
    });

    it("rejects linking an identity on a Discord-login account", async () => {
      const discordUser = await createUser(prisma, { authMethod: "discord" });

      await expect(
        service.linkIdentityOnly({
          userId: discordUser.id,
          discordUserId: "discord-2002",
          discordUsername: "Nope",
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it("rejects linking a Discord id already used by another account", async () => {
      const owner = await createUser(prisma, { authMethod: "discord", username: "owner" });
      await service.bindClaim({
        token: await issueClaimToken(owner.id),
        discordUserId: "discord-2003",
        discordUsername: "Owner",
      });
      const passwordUser = await createUser(prisma, { authMethod: "password_totp" });

      await expect(
        service.linkIdentityOnly({
          userId: passwordUser.id,
          discordUserId: "discord-2003",
          discordUsername: "Thief",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("is idempotent when re-linking the same Discord id (one account row)", async () => {
      const passwordUser = await createUser(prisma, { authMethod: "password_totp" });
      await service.linkIdentityOnly({
        userId: passwordUser.id,
        discordUserId: "discord-2010",
        discordUsername: "Same",
      });
      await service.linkIdentityOnly({
        userId: passwordUser.id,
        discordUserId: "discord-2010",
        discordUsername: "Same",
      });

      const rows = await prisma.account.count({
        where: { userId: passwordUser.id, providerId: "discord" },
      });
      expect(rows).toBe(1);
    });

    it("re-points the account row when re-linking a different Discord id", async () => {
      const passwordUser = await createUser(prisma, { authMethod: "password_totp" });
      await service.linkIdentityOnly({
        userId: passwordUser.id,
        discordUserId: "discord-2011",
        discordUsername: "First",
      });
      await service.linkIdentityOnly({
        userId: passwordUser.id,
        discordUserId: "discord-2012",
        discordUsername: "Second",
      });

      expect(await discordLoginAccountId(passwordUser.id)).toBe("discord-2012");
      const rows = await prisma.account.count({
        where: { userId: passwordUser.id, providerId: "discord" },
      });
      expect(rows).toBe(1);
    });

    it("unlinks a password account's identity", async () => {
      const passwordUser = await createUser(prisma, { authMethod: "password_totp" });
      await service.linkIdentityOnly({
        userId: passwordUser.id,
        discordUserId: "discord-2004",
        discordUsername: "Temp",
      });

      await service.unlinkIdentity(passwordUser.id);

      const stored = await prisma.user.findUnique({
        where: { id: passwordUser.id },
        select: { discordUserId: true, discordUsername: true },
      });
      expect(stored).toEqual({ discordUserId: null, discordUsername: null });
    });
  });
});
