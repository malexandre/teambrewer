import {
  type ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient, seedTwoTeams, type TwoTeamWorld } from "../../test/factories.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { RequestWithTenantContext } from "../tenancy/team-context.js";
import { TeamAdminGuard } from "./team-admin.guard.js";

function executionContextFor(request: RequestWithTenantContext): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

function requestFor(
  options: { userId?: string; isInstanceAdmin?: boolean; teamId?: string } = {},
): RequestWithTenantContext {
  const request = {
    headers: {},
    params: options.teamId !== undefined ? { teamId: options.teamId } : {},
  } as unknown as RequestWithTenantContext;
  if (options.userId !== undefined) {
    request.userId = options.userId;
  }
  if (options.isInstanceAdmin !== undefined) {
    request.isInstanceAdmin = options.isInstanceAdmin;
  }
  return request;
}

describe("TeamAdminGuard", () => {
  let prisma: PrismaClient;
  let guard: TeamAdminGuard;
  let world: TwoTeamWorld;

  beforeEach(async () => {
    const resetClient: Client = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();

    prisma = createTestPrismaClient();
    guard = new TeamAdminGuard(prisma as unknown as PrismaService);
    world = await seedTwoTeams(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("allows an instance-admin to manage any team (no membership required)", async () => {
    const request = requestFor({
      userId: world.instanceAdmin.id,
      isInstanceAdmin: true,
      teamId: world.teamA.id,
    });

    await expect(guard.canActivate(executionContextFor(request))).resolves.toBe(true);
  });

  it("404s an instance-admin acting on a team that does not exist", async () => {
    const request = requestFor({
      userId: world.instanceAdmin.id,
      isInstanceAdmin: true,
      teamId: "team-does-not-exist",
    });

    await expect(guard.canActivate(executionContextFor(request))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("allows a team-admin to manage their own team", async () => {
    const request = requestFor({ userId: world.teamAdminA.id, teamId: world.teamA.id });

    await expect(guard.canActivate(executionContextFor(request))).resolves.toBe(true);
  });

  it("denies a team-admin of team A acting on team B (403, no membership)", async () => {
    const request = requestFor({ userId: world.teamAdminA.id, teamId: world.teamB.id });

    await expect(guard.canActivate(executionContextFor(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("denies a plain member of the team (403, not a team-admin)", async () => {
    const request = requestFor({ userId: world.memberA.id, teamId: world.teamA.id });

    await expect(guard.canActivate(executionContextFor(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("rejects an unauthenticated request (401)", async () => {
    const request = requestFor({ teamId: world.teamA.id });

    await expect(guard.canActivate(executionContextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
