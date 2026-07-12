import {
  BadRequestException,
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient, seedTwoTeams, type TwoTeamWorld } from "../../test/factories.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { TeamContextGuard } from "./team-context.guard.js";
import type { RequestWithTenantContext } from "./team-context.js";

function executionContextFor(request: RequestWithTenantContext): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

function requestFor(options: { userId?: string; teamId?: string } = {}): RequestWithTenantContext {
  const headers: Record<string, string> = {};
  if (options.teamId !== undefined) {
    headers["x-team-id"] = options.teamId;
  }
  const request = { headers } as unknown as RequestWithTenantContext;
  if (options.userId !== undefined) {
    request.userId = options.userId;
  }
  return request;
}

describe("TeamContextGuard", () => {
  let prisma: PrismaClient;
  let guard: TeamContextGuard;
  let world: TwoTeamWorld;

  beforeEach(async () => {
    const resetClient: Client = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();

    prisma = createTestPrismaClient();
    guard = new TeamContextGuard(prisma as unknown as PrismaService);
    world = await seedTwoTeams(prisma);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("attaches a verified context for a member of the active team", async () => {
    const request = requestFor({ userId: world.memberA.id, teamId: world.teamA.id });

    await expect(guard.canActivate(executionContextFor(request))).resolves.toBe(true);
    expect(request.teamContext).toEqual({
      userId: world.memberA.id,
      teamId: world.teamA.id,
      role: "member",
      gameId: world.teamA.gameId,
    });
  });

  it("attaches the team's game so reference reads can be game-filtered", async () => {
    const request = requestFor({ userId: world.memberA.id, teamId: world.teamA.id });

    await guard.canActivate(executionContextFor(request));
    expect(request.teamContext?.gameId).toBe(world.teamA.gameId);
  });

  it("exposes the team-admin role in the context", async () => {
    const request = requestFor({ userId: world.teamAdminA.id, teamId: world.teamA.id });

    await guard.canActivate(executionContextFor(request));
    expect(request.teamContext?.role).toBe("team_admin");
  });

  it("denies a member of team A who forges X-Team-Id: team B (403)", async () => {
    const request = requestFor({ userId: world.memberA.id, teamId: world.teamB.id });

    await expect(guard.canActivate(executionContextFor(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(request.teamContext).toBeUndefined();
  });

  it("denies an unknown/forged team id (403)", async () => {
    const request = requestFor({ userId: world.memberA.id, teamId: "team-does-not-exist" });

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

  it("rejects a request without the X-Team-Id header (400)", async () => {
    const request = requestFor({ userId: world.memberA.id });

    await expect(guard.canActivate(executionContextFor(request))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
