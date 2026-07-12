import { BadRequestException, UnprocessableEntityException } from "@nestjs/common";
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient, createUser } from "../../test/factories.js";
import { DiscordAccountService } from "../auth/discord-account.service.js";
import { InviteTokenService } from "../auth/invite-token.service.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { DiscordOAuthClient, DiscordProfile } from "./discord-oauth.client.js";
import { DiscordOAuthService } from "./discord-oauth.service.js";

process.env["BETTER_AUTH_SECRET"] ??= "test-better-auth-secret-please-change-0123456789";

class FakeDiscordOAuthClient implements DiscordOAuthClient {
  constructor(private readonly profile: DiscordProfile) {}
  authorizeUrl(state: string, redirectUri: string): string {
    return `https://discord.com/api/oauth2/authorize?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }
  exchangeCode(): Promise<DiscordProfile> {
    return Promise.resolve(this.profile);
  }
}

function createService(prisma: PrismaClient, profile: DiscordProfile): DiscordOAuthService {
  const inviteTokens = new InviteTokenService(prisma as unknown as PrismaService);
  const discordAccounts = new DiscordAccountService(
    prisma as unknown as PrismaService,
    inviteTokens,
  );
  return new DiscordOAuthService(discordAccounts, new FakeDiscordOAuthClient(profile));
}

describe("DiscordOAuthService", () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    const resetClient: Client = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function issueClaimToken(userId: string): Promise<string> {
    const inviteTokens = new InviteTokenService(prisma as unknown as PrismaService);
    const { rawToken } = await inviteTokens.issue({ userId, purpose: "discord_link" });
    return rawToken;
  }

  it("completes a claim: state round-trips and the identity binds for login", async () => {
    const user = await createUser(prisma, { authMethod: "discord" });
    const token = await issueClaimToken(user.id);
    const service = createService(prisma, {
      discordUserId: "discord-9001",
      discordUsername: "Claimer",
    });

    const started = service.start("claim", token);
    const state = new URL(started.authorizeUrl).searchParams.get("state") ?? "";

    const result = await service.handleCallback({
      code: "auth-code",
      state,
      cookieNonce: started.nonce,
    });
    expect(result.kind).toBe("claim");
    const bound = await prisma.user.findUnique({
      where: { id: user.id },
      select: { discordUserId: true },
    });
    expect(bound?.discordUserId).toBe("discord-9001");
    // A login account link now exists (proven by the binding service's own tests).
    const account = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "discord" },
      select: { accountId: true },
    });
    expect(account?.accountId).toBe("discord-9001");
  });

  it("rejects a callback whose CSRF cookie nonce does not match the state (400)", async () => {
    const user = await createUser(prisma, { authMethod: "discord" });
    const token = await issueClaimToken(user.id);
    const service = createService(prisma, { discordUserId: "d", discordUsername: "d" });
    const started = service.start("claim", token);
    const state = new URL(started.authorizeUrl).searchParams.get("state") ?? "";

    await expect(
      service.handleCallback({ code: "auth-code", state, cookieNonce: "wrong-nonce" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a tampered state signature (400)", async () => {
    const service = createService(prisma, { discordUserId: "d", discordUsername: "d" });
    const started = service.start("claim", "some-token");

    await expect(
      service.handleCallback({
        code: "auth-code",
        state: "forged.signature",
        cookieNonce: started.nonce,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("completes an identity-only link for a password account without granting login", async () => {
    const passwordUser = await createUser(prisma, { authMethod: "password_totp" });
    const service = createService(prisma, {
      discordUserId: "discord-9100",
      discordUsername: "Ident",
    });
    const started = service.start("link", passwordUser.id);
    const state = new URL(started.authorizeUrl).searchParams.get("state") ?? "";

    const result = await service.handleCallback({ code: "c", state, cookieNonce: started.nonce });
    expect(result.kind).toBe("link");
    const account = await prisma.account.findFirst({
      where: { userId: passwordUser.id, providerId: "discord" },
    });
    expect(account).toBeNull();
  });

  it("propagates method exclusivity: a password account cannot be claimed for Discord login", async () => {
    const passwordUser = await createUser(prisma, { authMethod: "password_totp" });
    const token = await issueClaimToken(passwordUser.id);
    const service = createService(prisma, { discordUserId: "d", discordUsername: "d" });
    const started = service.start("claim", token);
    const state = new URL(started.authorizeUrl).searchParams.get("state") ?? "";

    await expect(
      service.handleCallback({ code: "c", state, cookieNonce: started.nonce }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
