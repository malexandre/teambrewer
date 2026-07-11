import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { inject } from "vitest";

import { PrismaClient } from "../src/generated/prisma/client.js";

/**
 * Test fixtures for the identity/tenancy models. Centralised here so every
 * isolation test builds users/teams/memberships the same way, always with a
 * correct `teamId` — the two-team world (`seedTwoTeams`) is the canonical
 * setup for proving a user in team A cannot reach team B.
 */

export function createTestPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: inject("databaseUrl") }),
  });
}

type AuthMethod = "password_totp" | "discord";
type TeamRole = "team_admin" | "member";

export interface CreateUserOptions {
  username?: string;
  displayName?: string;
  isInstanceAdmin?: boolean;
  authMethod?: AuthMethod;
  twoFactorEnabled?: boolean;
  discordUserId?: string | null;
  discordUsername?: string | null;
}

export interface TestUser {
  id: string;
  username: string;
  displayName: string;
  isInstanceAdmin: boolean;
  authMethod: string;
}

export async function createUser(
  prisma: PrismaClient,
  options: CreateUserOptions = {},
): Promise<TestUser> {
  const id = randomUUID();
  const username = options.username ?? `user_${id.slice(0, 8)}`;
  const displayName = options.displayName ?? username;
  const created = await prisma.user.create({
    data: {
      id,
      name: displayName,
      // Synthetic, non-routable email — TeamBrewer has no email (ADR-0003).
      email: `${username}@users.teambrewer.local`,
      emailVerified: true,
      username,
      displayName,
      isInstanceAdmin: options.isInstanceAdmin ?? false,
      authMethod: options.authMethod ?? "password_totp",
      twoFactorEnabled: options.twoFactorEnabled ?? false,
      discordUserId: options.discordUserId ?? null,
      discordUsername: options.discordUsername ?? null,
    },
  });
  return {
    id: created.id,
    username: created.username ?? username,
    displayName: created.displayName,
    isInstanceAdmin: created.isInstanceAdmin,
    authMethod: created.authMethod,
  };
}

export interface CreateTeamOptions {
  name?: string;
  slug?: string;
  gameId?: string;
  createdBy?: string;
}

export interface TestTeam {
  id: string;
  name: string;
  slug: string;
  gameId: string;
}

export async function createTeam(
  prisma: PrismaClient,
  options: CreateTeamOptions = {},
): Promise<TestTeam> {
  const suffix = randomUUID().slice(0, 8);
  const created = await prisma.team.create({
    data: {
      name: options.name ?? `Team ${suffix}`,
      slug: options.slug ?? `team-${suffix}`,
      gameId: options.gameId ?? "flesh-and-blood",
      createdBy: options.createdBy ?? "system",
    },
  });
  return {
    id: created.id,
    name: created.name,
    slug: created.slug,
    gameId: created.gameId,
  };
}

export async function addMembership(
  prisma: PrismaClient,
  input: { teamId: string; userId: string; role: TeamRole },
): Promise<void> {
  await prisma.teamMembership.create({ data: input });
}

/**
 * The canonical two-team world for isolation tests: an instance-admin, plus
 * team A (with a team-admin and a member) and team B (with its own member).
 * `memberA` belongs only to team A and must never be able to reach team B.
 */
export interface TwoTeamWorld {
  instanceAdmin: TestUser;
  teamA: TestTeam;
  teamB: TestTeam;
  teamAdminA: TestUser;
  memberA: TestUser;
  memberB: TestUser;
}

export async function seedTwoTeams(prisma: PrismaClient): Promise<TwoTeamWorld> {
  const instanceAdmin = await createUser(prisma, {
    username: "instance_admin",
    displayName: "Instance Admin",
    isInstanceAdmin: true,
  });
  const teamA = await createTeam(prisma, { name: "Alpha Squad" });
  const teamB = await createTeam(prisma, { name: "Bravo Squad" });
  const teamAdminA = await createUser(prisma, {
    username: "admin_alpha",
    displayName: "Alpha Admin",
  });
  const memberA = await createUser(prisma, {
    username: "member_alpha",
    displayName: "Alpha Member",
  });
  const memberB = await createUser(prisma, {
    username: "member_bravo",
    displayName: "Bravo Member",
  });
  await addMembership(prisma, {
    teamId: teamA.id,
    userId: teamAdminA.id,
    role: "team_admin",
  });
  await addMembership(prisma, { teamId: teamA.id, userId: memberA.id, role: "member" });
  await addMembership(prisma, { teamId: teamB.id, userId: memberB.id, role: "member" });
  return { instanceAdmin, teamA, teamB, teamAdminA, memberA, memberB };
}
