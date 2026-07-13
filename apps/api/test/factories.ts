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
 * Events & gauntlets fixtures (phase-05). Team-owned; permissions are a shared team
 * board (no owner column). An event needs a `teamId` and a `formatId`; a gauntlet
 * entry needs its `eventId`/`teamId` plus exactly one target form; attendance is one
 * RSVP row per (event, user). Everything else defaults so isolation tests build one
 * in a single call.
 */

type EventStatus = "upcoming" | "active" | "completed" | "archived";
type EventImportance = "local" | "regional" | "national" | "major";
type AttendanceStatus = "going" | "maybe" | "not_going";

export interface CreateEventOptions {
  teamId: string;
  formatId: string;
  name?: string;
  date?: Date;
  location?: string | null;
  importance?: EventImportance;
  description?: string;
  status?: EventStatus;
  archivedAt?: Date | null;
}

export interface TestEvent {
  id: string;
  teamId: string;
  name: string;
  formatId: string;
  status: string;
}

export async function createEvent(
  prisma: PrismaClient,
  options: CreateEventOptions,
): Promise<TestEvent> {
  const suffix = randomUUID().slice(0, 8);
  const created = await prisma.event.create({
    data: {
      teamId: options.teamId,
      formatId: options.formatId,
      name: options.name ?? `Event ${suffix}`,
      date: options.date ?? new Date("2026-09-12T00:00:00.000Z"),
      location: options.location ?? null,
      importance: options.importance ?? "regional",
      description: options.description ?? "",
      status: options.status ?? "upcoming",
      archivedAt: options.archivedAt ?? null,
    },
  });
  return {
    id: created.id,
    teamId: created.teamId,
    name: created.name,
    formatId: created.formatId,
    status: created.status,
  };
}

export interface CreateGauntletEntryOptions {
  eventId: string;
  teamId: string;
  referenceDeckId?: string | null;
  heroId?: string | null;
  archetypeLabel?: string | null;
  expectedMetaShare?: number;
  notes?: string;
}

export async function createGauntletEntry(
  prisma: PrismaClient,
  options: CreateGauntletEntryOptions,
): Promise<{ id: string; eventId: string; teamId: string }> {
  const created = await prisma.gauntletEntry.create({
    data: {
      eventId: options.eventId,
      teamId: options.teamId,
      referenceDeckId: options.referenceDeckId ?? null,
      heroId: options.heroId ?? null,
      archetypeLabel:
        options.archetypeLabel ?? (options.referenceDeckId || options.heroId ? null : "Aggro Red"),
      expectedMetaShare: options.expectedMetaShare ?? 20,
      notes: options.notes ?? "",
    },
  });
  return { id: created.id, eventId: created.eventId, teamId: created.teamId };
}

export async function createAttendance(
  prisma: PrismaClient,
  options: { eventId: string; userId: string; status?: AttendanceStatus },
): Promise<{ id: string; eventId: string; userId: string; status: string }> {
  const created = await prisma.attendance.create({
    data: {
      eventId: options.eventId,
      userId: options.userId,
      status: options.status ?? "going",
    },
  });
  return {
    id: created.id,
    eventId: created.eventId,
    userId: created.userId,
    status: created.status,
  };
}

/**
 * Game-logging fixtures (phase-06). Team-owned; a log needs a `teamId`, a
 * `loggedById`, a `formatId`, side-A pilot + deck, a result, the four confidence
 * factors, and a derived `confidenceWeight`. Side B defaults to an external hero
 * opponent. Everything else defaults so isolation/aggregation tests build one in a
 * single call.
 */

type GameSide = "A" | "B";
type SkillParity = "evenly_matched" | "minor_gap" | "major_gap";
type Seriousness = "tournament_serious" | "focused_practice" | "casual";
type DeckMaturity = "both_tuned" | "partially_tuned" | "experimental";
type PilotFamiliarity = "knows_well" | "learning" | "first_time";

export interface CreateGameLogOptions {
  teamId: string;
  loggedById: string;
  formatId: string;
  pilotUserId: string;
  deckId: string;
  metaId?: string | null;
  playedAt?: Date;
  opponentPilotUserId?: string | null;
  externalOpponentName?: string | null;
  opponentDeckId?: string | null;
  heroId?: string | null;
  archetypeLabel?: string | null;
  firstPlayerSide?: GameSide;
  bestOf?: number;
  gamesWonA?: number;
  gamesWonB?: number;
  skillParity?: SkillParity;
  seriousness?: Seriousness;
  deckMaturity?: DeckMaturity;
  pilotFamiliarity?: PilotFamiliarity;
  confidenceWeight?: number;
  archivedAt?: Date | null;
}

export interface TestGameLog {
  id: string;
  teamId: string;
  loggedById: string;
  confidenceWeight: number;
}

export async function createGameLog(
  prisma: PrismaClient,
  options: CreateGameLogOptions,
): Promise<TestGameLog> {
  const hasIdentifiedOpponent =
    options.opponentPilotUserId ||
    options.opponentDeckId ||
    options.heroId ||
    options.archetypeLabel;
  const created = await prisma.gameLog.create({
    data: {
      teamId: options.teamId,
      loggedById: options.loggedById,
      formatId: options.formatId,
      metaId: options.metaId ?? null,
      playedAt: options.playedAt ?? new Date("2026-07-01T00:00:00.000Z"),
      pilotUserId: options.pilotUserId,
      deckId: options.deckId,
      opponentPilotUserId: options.opponentPilotUserId ?? null,
      externalOpponentName: options.externalOpponentName ?? null,
      opponentDeckId: options.opponentDeckId ?? null,
      heroId: options.heroId ?? null,
      archetypeLabel: options.archetypeLabel ?? (hasIdentifiedOpponent ? null : "Aggro Red"),
      firstPlayerSide: options.firstPlayerSide ?? "A",
      bestOf: options.bestOf ?? 3,
      gamesWonA: options.gamesWonA ?? 2,
      gamesWonB: options.gamesWonB ?? 1,
      skillParity: options.skillParity ?? "evenly_matched",
      seriousness: options.seriousness ?? "tournament_serious",
      deckMaturity: options.deckMaturity ?? "both_tuned",
      pilotFamiliarity: options.pilotFamiliarity ?? "knows_well",
      confidenceWeight: options.confidenceWeight ?? 1,
      archivedAt: options.archivedAt ?? null,
    },
  });
  return {
    id: created.id,
    teamId: created.teamId,
    loggedById: created.loggedById,
    confidenceWeight: created.confidenceWeight,
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
 * Game-plans, deck selection & retrospective fixtures (phase-09). MatchupGamePlan
 * and Retrospective are team-owned; DeckSelection is scoped transitively through its
 * event (no teamId, like Attendance). Each defaults everything but the required
 * references so an isolation test builds one in a single call.
 */

export interface CreateMatchupGamePlanOptions {
  teamId: string;
  ourDeckId: string;
  formatId: string;
  updatedById: string;
  opponentHeroId?: string | null;
  opponentArchetypeLabel?: string | null;
  opponentRef?: string;
  opponentSnapshotLabel?: string;
  body?: string;
  archivedAt?: Date | null;
}

export async function createMatchupGamePlan(
  prisma: PrismaClient,
  options: CreateMatchupGamePlanOptions,
): Promise<{ id: string; teamId: string; ourDeckId: string; opponentRef: string }> {
  const label = options.opponentArchetypeLabel ?? (options.opponentHeroId ? "Hero" : "Aggro Red");
  const opponentRef =
    options.opponentRef ??
    (options.opponentHeroId
      ? `hero:${options.opponentHeroId}`
      : `label:${(options.opponentArchetypeLabel ?? "Aggro Red").trim().toLowerCase()}`);
  const created = await prisma.matchupGamePlan.create({
    data: {
      teamId: options.teamId,
      ourDeckId: options.ourDeckId,
      formatId: options.formatId,
      updatedById: options.updatedById,
      opponentHeroId: options.opponentHeroId ?? null,
      opponentArchetypeLabel:
        options.opponentArchetypeLabel ?? (options.opponentHeroId ? null : "Aggro Red"),
      opponentRef,
      opponentSnapshotLabel: options.opponentSnapshotLabel ?? label,
      body: options.body ?? "Mulligan aggressively; race the clock.",
      archivedAt: options.archivedAt ?? null,
    },
  });
  return {
    id: created.id,
    teamId: created.teamId,
    ourDeckId: created.ourDeckId,
    opponentRef: created.opponentRef,
  };
}

export async function createDeckSelection(
  prisma: PrismaClient,
  options: {
    eventId: string;
    userId: string;
    deckId: string;
    reasoning?: string;
    locked?: boolean;
    lockedAt?: Date | null;
  },
): Promise<{ id: string; eventId: string; userId: string; locked: boolean }> {
  const created = await prisma.deckSelection.create({
    data: {
      eventId: options.eventId,
      userId: options.userId,
      deckId: options.deckId,
      reasoning: options.reasoning ?? "",
      locked: options.locked ?? false,
      lockedAt: options.lockedAt ?? (options.locked ? new Date() : null),
    },
  });
  return {
    id: created.id,
    eventId: created.eventId,
    userId: created.userId,
    locked: created.locked,
  };
}

export async function createRetrospective(
  prisma: PrismaClient,
  options: {
    eventId: string;
    teamId: string;
    authorId: string;
    body?: string;
    resultsSummary?: string;
    learnings?: string;
    archivedAt?: Date | null;
  },
): Promise<{ id: string; eventId: string; teamId: string }> {
  const created = await prisma.retrospective.create({
    data: {
      eventId: options.eventId,
      teamId: options.teamId,
      authorId: options.authorId,
      body: options.body ?? "We went 5-2; the plan held up.",
      resultsSummary: options.resultsSummary ?? "",
      learnings: options.learnings ?? "",
      archivedAt: options.archivedAt ?? null,
    },
  });
  return { id: created.id, eventId: created.eventId, teamId: created.teamId };
}

/**
 * Metas fixtures (meta-pivot redesign, WS-2). Team-owned; permissions are a shared
 * team board (no owner column). A meta needs a `teamId`; a deck entry needs its
 * `metaId`/`teamId`, a `tier`, and exactly one target form plus its derived
 * `opponentSnapshotLabel`. Everything else defaults so isolation tests build one in
 * a single call.
 */

type MetaTierValue = "meta_defining" | "contender" | "counter_meta" | "fringe";

export interface CreateMetaOptions {
  teamId: string;
  name?: string;
  startDate?: Date;
  endDate?: Date;
  description?: string;
  archivedAt?: Date | null;
}

export interface TestMeta {
  id: string;
  teamId: string;
  name: string;
}

export async function createMeta(
  prisma: PrismaClient,
  options: CreateMetaOptions,
): Promise<TestMeta> {
  const suffix = randomUUID().slice(0, 8);
  const created = await prisma.meta.create({
    data: {
      teamId: options.teamId,
      name: options.name ?? `Meta ${suffix}`,
      startDate: options.startDate ?? new Date("2026-07-01T00:00:00.000Z"),
      endDate: options.endDate ?? new Date("2026-08-01T00:00:00.000Z"),
      description: options.description ?? "",
      archivedAt: options.archivedAt ?? null,
    },
  });
  return { id: created.id, teamId: created.teamId, name: created.name };
}

export interface CreateMetaDeckEntryOptions {
  metaId: string;
  teamId: string;
  tier?: MetaTierValue;
  referenceDeckId?: string | null;
  heroId?: string | null;
  archetypeLabel?: string | null;
  opponentSnapshotLabel?: string;
  notes?: string;
}

export async function createMetaDeckEntry(
  prisma: PrismaClient,
  options: CreateMetaDeckEntryOptions,
): Promise<{ id: string; metaId: string; teamId: string; tier: string }> {
  const archetypeLabel =
    options.archetypeLabel ?? (options.referenceDeckId || options.heroId ? null : "Aggro Red");
  const created = await prisma.metaDeckEntry.create({
    data: {
      metaId: options.metaId,
      teamId: options.teamId,
      tier: options.tier ?? "contender",
      referenceDeckId: options.referenceDeckId ?? null,
      heroId: options.heroId ?? null,
      archetypeLabel,
      opponentSnapshotLabel: options.opponentSnapshotLabel ?? archetypeLabel ?? "Target",
      notes: options.notes ?? "",
    },
  });
  return {
    id: created.id,
    metaId: created.metaId,
    teamId: created.teamId,
    tier: created.tier,
  };
}

/**
 * Tasks fixtures (meta-pivot redesign, WS-3). Team-owned; the single unit of testing
 * work merging the old card-test suggestions + test assignments. A task needs a
 * `teamId` and an `authorId`; everything else defaults so isolation tests build one
 * in a single call. `TaskVote` is scoped transitively through its parent task.
 */

type TaskStatusValue = "proposed" | "assigned" | "finished" | "abandoned";

export interface CreateTaskOptions {
  teamId: string;
  authorId: string;
  title?: string;
  description?: string;
  deckId?: string | null;
  status?: TaskStatusValue;
  assigneeId?: string | null;
  report?: string;
  archivedAt?: Date | null;
}

export interface TestTask {
  id: string;
  teamId: string;
  authorId: string;
  status: string;
}

export async function createTask(
  prisma: PrismaClient,
  options: CreateTaskOptions,
): Promise<TestTask> {
  const suffix = randomUUID().slice(0, 8);
  const created = await prisma.task.create({
    data: {
      teamId: options.teamId,
      authorId: options.authorId,
      title: options.title ?? `Task ${suffix}`,
      description: options.description ?? "",
      deckId: options.deckId ?? null,
      status: options.status ?? "proposed",
      assigneeId: options.assigneeId ?? null,
      report: options.report ?? "",
      archivedAt: options.archivedAt ?? null,
    },
  });
  return {
    id: created.id,
    teamId: created.teamId,
    authorId: created.authorId,
    status: created.status,
  };
}

export async function createTaskVote(
  prisma: PrismaClient,
  options: { taskId: string; userId: string },
): Promise<{ id: string; taskId: string; userId: string }> {
  const created = await prisma.taskVote.create({
    data: { taskId: options.taskId, userId: options.userId },
  });
  return { id: created.id, taskId: created.taskId, userId: created.userId };
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
