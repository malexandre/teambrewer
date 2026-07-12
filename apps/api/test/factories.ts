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
 * Game reference-data fixtures (phase-02). Global, per-game, no `teamId` — reads
 * are filtered by the active team's game. `Game.id` is the slug that `Team.gameId`
 * holds (default "flesh-and-blood"); cards/heroes/formats FK to it.
 */

export interface CreateGameOptions {
  id?: string;
  key?: string;
  name?: string;
}

export interface TestGame {
  id: string;
  key: string;
  name: string;
}

export async function createGame(
  prisma: PrismaClient,
  options: CreateGameOptions = {},
): Promise<TestGame> {
  const id = options.id ?? "flesh-and-blood";
  const created = await prisma.game.upsert({
    where: { id },
    update: {},
    create: {
      id,
      key: options.key ?? "flesh_and_blood",
      name: options.name ?? "Flesh and Blood",
    },
  });
  return { id: created.id, key: created.key, name: created.name };
}

export interface CreateCardOptions {
  gameId?: string;
  externalId?: string;
  name?: string;
  pitch?: number | null;
  imageUrl?: string | null;
  archivedAt?: Date | null;
}

export interface TestCard {
  id: string;
  gameId: string;
  externalId: string;
  name: string;
  pitch: number | null;
}

export async function createCard(
  prisma: PrismaClient,
  options: CreateCardOptions = {},
): Promise<TestCard> {
  const suffix = randomUUID().slice(0, 8);
  const created = await prisma.card.create({
    data: {
      gameId: options.gameId ?? "flesh-and-blood",
      externalId: options.externalId ?? `card-${suffix}`,
      name: options.name ?? `Card ${suffix}`,
      pitch: options.pitch ?? null,
      imageUrl: options.imageUrl ?? null,
      archivedAt: options.archivedAt ?? null,
    },
  });
  return {
    id: created.id,
    gameId: created.gameId,
    externalId: created.externalId,
    name: created.name,
    pitch: created.pitch,
  };
}

export interface CreateHeroOptions {
  gameId?: string;
  externalId?: string;
  name?: string;
  classes?: string[];
  talents?: string[];
  startingLife?: number | null;
  imageUrl?: string | null;
}

export async function createHero(
  prisma: PrismaClient,
  options: CreateHeroOptions = {},
): Promise<{ id: string; name: string; gameId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const created = await prisma.hero.create({
    data: {
      gameId: options.gameId ?? "flesh-and-blood",
      externalId: options.externalId ?? `hero-${suffix}`,
      name: options.name ?? `Hero ${suffix}`,
      classes: options.classes ?? [],
      talents: options.talents ?? [],
      startingLife: options.startingLife ?? null,
      imageUrl: options.imageUrl ?? null,
    },
  });
  return { id: created.id, name: created.name, gameId: created.gameId };
}

export async function createFormat(
  prisma: PrismaClient,
  options: {
    gameId?: string;
    key?: string;
    name?: string;
    isConstructed?: boolean;
    sortOrder?: number;
  } = {},
): Promise<{ id: string; key: string; name: string; gameId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const created = await prisma.format.create({
    data: {
      gameId: options.gameId ?? "flesh-and-blood",
      key: options.key ?? `format-${suffix}`,
      name: options.name ?? `Format ${suffix}`,
      isConstructed: options.isConstructed ?? true,
      sortOrder: options.sortOrder ?? 0,
    },
  });
  return { id: created.id, key: created.key, name: created.name, gameId: created.gameId };
}

/**
 * Deck fixtures (phase-03). Team-owned, link-only (ADR-0002). A deck needs a
 * `teamId`, the team's `gameId`, a `formatId`, and an `ownerId`; everything else
 * has a sensible default so isolation tests can create a deck in one call.
 */

export interface CreateDeckOptions {
  teamId: string;
  ownerId: string;
  formatId: string;
  gameId?: string;
  heroId?: string | null;
  name?: string;
  externalUrl?: string;
  source?: string;
  status?: "exploratory" | "testing" | "tournament_ready" | "retired";
  visibility?: "team" | "private";
  isReference?: boolean;
  tags?: string[];
  notes?: string;
  archivedAt?: Date | null;
}

export interface TestDeck {
  id: string;
  teamId: string;
  ownerId: string;
  name: string;
  status: string;
  visibility: string;
}

export async function createDeck(
  prisma: PrismaClient,
  options: CreateDeckOptions,
): Promise<TestDeck> {
  const suffix = randomUUID().slice(0, 8);
  const created = await prisma.deck.create({
    data: {
      teamId: options.teamId,
      ownerId: options.ownerId,
      formatId: options.formatId,
      gameId: options.gameId ?? "flesh-and-blood",
      heroId: options.heroId ?? null,
      name: options.name ?? `Deck ${suffix}`,
      externalUrl: options.externalUrl ?? `https://fabrary.net/decks/${suffix}`,
      source: options.source ?? "fabrary",
      status: options.status ?? "exploratory",
      visibility: options.visibility ?? "team",
      isReference: options.isReference ?? false,
      tags: options.tags ?? [],
      notes: options.notes ?? "",
      archivedAt: options.archivedAt ?? null,
    },
  });
  return {
    id: created.id,
    teamId: created.teamId,
    ownerId: created.ownerId,
    name: created.name,
    status: created.status,
    visibility: created.visibility,
  };
}

/**
 * Collaboration fixtures (phase-04). Comments, notifications, and activity events
 * are team-scoped and addressed polymorphically by `(subjectType, subjectId)`.
 * A comment needs a `teamId`, `authorId`, and a subject; everything else defaults
 * so isolation tests can create one in a single call.
 */

export interface CreateCommentOptions {
  teamId: string;
  authorId: string;
  subjectId: string;
  subjectType?: string;
  body?: string;
  parentCommentId?: string | null;
  archivedAt?: Date | null;
}

export interface TestComment {
  id: string;
  teamId: string;
  authorId: string;
  subjectType: string;
  subjectId: string;
  parentCommentId: string | null;
}

export async function createComment(
  prisma: PrismaClient,
  options: CreateCommentOptions,
): Promise<TestComment> {
  const created = await prisma.comment.create({
    data: {
      teamId: options.teamId,
      authorId: options.authorId,
      subjectType: options.subjectType ?? "deck",
      subjectId: options.subjectId,
      body: options.body ?? "A test comment.",
      parentCommentId: options.parentCommentId ?? null,
      archivedAt: options.archivedAt ?? null,
    },
  });
  return {
    id: created.id,
    teamId: created.teamId,
    authorId: created.authorId,
    subjectType: created.subjectType,
    subjectId: created.subjectId,
    parentCommentId: created.parentCommentId,
  };
}

export interface CreateNotificationOptions {
  teamId: string;
  userId: string;
  subjectId: string;
  type?: string;
  subjectType?: string;
  commentId?: string | null;
  readAt?: Date | null;
}

export async function createNotification(
  prisma: PrismaClient,
  options: CreateNotificationOptions,
): Promise<{ id: string; teamId: string; userId: string; readAt: Date | null }> {
  const created = await prisma.notification.create({
    data: {
      teamId: options.teamId,
      userId: options.userId,
      type: options.type ?? "mention",
      subjectType: options.subjectType ?? "deck",
      subjectId: options.subjectId,
      commentId: options.commentId ?? null,
      readAt: options.readAt ?? null,
    },
  });
  return { id: created.id, teamId: created.teamId, userId: created.userId, readAt: created.readAt };
}

export interface CreateActivityEventOptions {
  teamId: string;
  actorId: string;
  verb: string;
  subjectId: string;
  subjectType?: string;
}

export async function createActivityEvent(
  prisma: PrismaClient,
  options: CreateActivityEventOptions,
): Promise<{ id: string; teamId: string; verb: string }> {
  const created = await prisma.activityEvent.create({
    data: {
      teamId: options.teamId,
      actorId: options.actorId,
      verb: options.verb,
      subjectType: options.subjectType ?? "deck",
      subjectId: options.subjectId,
    },
  });
  return { id: created.id, teamId: created.teamId, verb: created.verb };
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
