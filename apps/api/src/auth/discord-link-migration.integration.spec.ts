import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient, createUser } from "../../test/factories.js";
import type { PrismaClient } from "../generated/prisma/client.js";

// Mirrors migration.sql for drop_identity_only_discord_links. Keep these two in sync.
const DROP_IDENTITY_ONLY_LINKS_SQL = `
UPDATE "user"
SET discord_user_id = NULL, discord_username = NULL
WHERE discord_user_id IS NOT NULL
  AND id NOT IN (SELECT user_id FROM "account" WHERE provider_id = 'discord');
`;

describe("drop_identity_only_discord_links migration", () => {
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

  it("clears identity-only links but leaves Discord-login accounts intact", async () => {
    // Identity-only link: user has discord fields but NO discord account row.
    const identityOnly = await createUser(prisma, {
      authMethod: "password_totp",
      discordUserId: "discord-idonly",
      discordUsername: "IdOnly",
    });
    // Discord-login account: discord fields AND a discord account row.
    const discordLogin = await createUser(prisma, {
      authMethod: "discord",
      discordUserId: "discord-login",
      discordUsername: "Login",
    });
    await prisma.account.create({
      data: {
        id: randomUUID(),
        userId: discordLogin.id,
        providerId: "discord",
        accountId: "discord-login",
      },
    });

    await prisma.$executeRawUnsafe(DROP_IDENTITY_ONLY_LINKS_SQL);

    const cleared = await prisma.user.findUnique({
      where: { id: identityOnly.id },
      select: { discordUserId: true, discordUsername: true },
    });
    expect(cleared).toEqual({ discordUserId: null, discordUsername: null });

    const kept = await prisma.user.findUnique({
      where: { id: discordLogin.id },
      select: { discordUserId: true, discordUsername: true },
    });
    expect(kept).toEqual({ discordUserId: "discord-login", discordUsername: "Login" });
  });
});
