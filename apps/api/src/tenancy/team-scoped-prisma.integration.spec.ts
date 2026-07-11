import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient, seedTwoTeams, type TwoTeamWorld } from "../../test/factories.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { createTeamScopedClient } from "./team-scoped-prisma.js";

describe("createTeamScopedClient", () => {
  let prisma: PrismaClient;
  let world: TwoTeamWorld;

  beforeEach(async () => {
    const resetClient: Client = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();

    prisma = createTestPrismaClient();
    world = await seedTwoTeams(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("filters reads on a team-owned model by the context teamId", async () => {
    const scoped = createTeamScopedClient(prisma as unknown as PrismaService, world.teamA.id);

    const memberships = await scoped.teamMembership.findMany();

    expect(memberships).toHaveLength(2); // team A: team-admin + member
    expect(memberships.every((membership) => membership.teamId === world.teamA.id)).toBe(true);
  });

  it("overrides a client-supplied teamId in the where clause (never trusts it)", async () => {
    const scoped = createTeamScopedClient(prisma as unknown as PrismaService, world.teamA.id);

    // Caller tries to read team B; the verified context forces team A.
    const memberships = await scoped.teamMembership.findMany({
      where: { teamId: world.teamB.id },
    });

    expect(memberships.every((membership) => membership.teamId === world.teamA.id)).toBe(true);
    expect(memberships.some((membership) => membership.teamId === world.teamB.id)).toBe(false);
  });

  it("stamps the context teamId on writes, ignoring the body", async () => {
    const scoped = createTeamScopedClient(prisma as unknown as PrismaService, world.teamA.id);

    // No teamId supplied at all — it must be stamped from context. The scoped
    // client is typed as the full PrismaService (which still lists teamId as
    // required), so cast to a looser signature to exercise runtime injection —
    // this mirrors feature code that relies on the helper to supply teamId.
    const createWithoutTeamId = scoped.teamMembership.create as unknown as (args: {
      data: Record<string, unknown>;
    }) => Promise<{ teamId: string }>;
    const stamped = await createWithoutTeamId({
      data: { userId: world.instanceAdmin.id, role: "member" },
    });
    expect(stamped.teamId).toBe(world.teamA.id);

    // A forged teamId in the body is overridden to the context team.
    const forged = await scoped.teamMembership.create({
      data: { userId: world.memberB.id, role: "member", teamId: world.teamB.id },
    });
    expect(forged.teamId).toBe(world.teamA.id);
  });

  it("scopes count to the context team", async () => {
    const scoped = createTeamScopedClient(prisma as unknown as PrismaService, world.teamB.id);

    await expect(scoped.teamMembership.count()).resolves.toBe(1); // team B has one member
  });

  it("leaves global models unscoped", async () => {
    const scoped = createTeamScopedClient(prisma as unknown as PrismaService, world.teamA.id);

    // User is global (no teamId) — all seeded users are visible
    // (instance-admin + team-admin A + member A + member B).
    const users = await scoped.user.findMany();
    expect(users).toHaveLength(4);
  });
});
