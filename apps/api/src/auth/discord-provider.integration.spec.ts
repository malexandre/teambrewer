import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient } from "../../test/factories.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { AuthService } from "./auth.service.js";

// Configure Better Auth + a dummy Discord app before any AuthService is built.
process.env["BETTER_AUTH_SECRET"] ??= "test-better-auth-secret-please-change-0123456789";
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3000";
process.env["DISCORD_CLIENT_ID"] = "1234567890123456789";
process.env["DISCORD_CLIENT_SECRET"] = "test-discord-client-secret";
process.env["DISCORD_REDIRECT_URI"] = "http://localhost:3000/api/auth/callback/discord";

type PrismaClient = ReturnType<typeof createTestPrismaClient>;

describe("Discord provider configuration", () => {
  let prisma: PrismaClient;
  let service: AuthService;

  beforeEach(async () => {
    const resetClient: Client = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();

    prisma = createTestPrismaClient();
    service = new AuthService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("generates a Discord authorization URL requesting only the identify scope", async () => {
    const result = await service.api.signInSocial({
      body: { provider: "discord", callbackURL: "/" },
    });

    const url = (result as { url?: string }).url;
    expect(url).toBeTruthy();
    const authorizeUrl = new URL(url as string);
    expect(authorizeUrl.hostname).toBe("discord.com");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("1234567890123456789");
    // Only `identify` — never `email` (ADR-0009 / no-email design).
    expect(authorizeUrl.searchParams.get("scope")).toBe("identify");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/callback/discord",
    );
  });
});
