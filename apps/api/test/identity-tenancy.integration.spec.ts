import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { createDatabaseClient, resetDatabase } from "./database.js";
import {
  addMembership,
  createTeam,
  createTestPrismaClient,
  createUser,
  seedTwoTeams,
} from "./factories.js";

describe("identity & tenancy schema", () => {
  let resetClient: Client;
  let prisma: PrismaClient;

  beforeEach(async () => {
    resetClient = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("seeds a two-team world with correctly scoped memberships", async () => {
    const world = await seedTwoTeams(prisma);

    const teamAMembers = await prisma.teamMembership.findMany({
      where: { teamId: world.teamA.id },
    });
    const teamBMembers = await prisma.teamMembership.findMany({
      where: { teamId: world.teamB.id },
    });

    expect(teamAMembers.map((membership) => membership.userId).sort()).toEqual(
      [world.teamAdminA.id, world.memberA.id].sort(),
    );
    expect(teamBMembers.map((membership) => membership.userId)).toEqual([world.memberB.id]);
    // memberA belongs only to team A — the basis for every isolation test.
    expect(teamBMembers.some((membership) => membership.userId === world.memberA.id)).toBe(false);
  });

  it("enforces a single membership per (teamId, userId)", async () => {
    const team = await createTeam(prisma);
    const user = await createUser(prisma);
    await addMembership(prisma, { teamId: team.id, userId: user.id, role: "member" });

    await expect(
      addMembership(prisma, { teamId: team.id, userId: user.id, role: "team_admin" }),
    ).rejects.toThrow();
  });

  it("keeps discordUserId unique across accounts", async () => {
    await createUser(prisma, { authMethod: "discord", discordUserId: "discord-123" });

    await expect(
      createUser(prisma, { authMethod: "discord", discordUserId: "discord-123" }),
    ).rejects.toThrow();
  });

  it("persists TeamBrewer domain fields on the user", async () => {
    const created = await createUser(prisma, {
      username: "meta_caller",
      displayName: "Meta Caller",
      isInstanceAdmin: true,
    });

    const found = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
    expect(found.displayName).toBe("Meta Caller");
    expect(found.isInstanceAdmin).toBe(true);
    expect(found.authMethod).toBe("password_totp");
    expect(found.email).toBe("meta_caller@users.teambrewer.local");
  });
});
