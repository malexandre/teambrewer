import { NotFoundException } from "@nestjs/common";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { CommentThreadQuery, CreateCommentInput } from "@teambrewer/shared";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  addMembership,
  createDeck,
  createFormat,
  createGame,
  createTeam,
  createTestPrismaClient,
  createUser,
  type TestTeam,
  type TestUser,
} from "../../test/factories.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { RequestWithTenantContext, TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";
import { CollaborationActivityService } from "./activity.service.js";
import { CollaborationService } from "./collaboration.service.js";
import { type AttachableSubjectResolver, SubjectResolverRegistry } from "./subject-resolver.js";

/**
 * Proves the collaboration subsystem is genuinely polymorphic: the exact same
 * service code path (comment + threading + mention → notification + activity)
 * works for a subject type that is NOT the deck adopter. A test-only resolver
 * (`test_subject`, backed here by a deck row for a real team-scoped lookup) is
 * registered and driven directly through the service, since the HTTP boundary
 * enum deliberately only admits adopted types.
 */
describe("Collaboration polymorphism (service-level, test-only subject type)", () => {
  let prisma: PrismaClient;
  let teamA: TestTeam;
  let teamB: TestTeam;
  let memberA: TestUser;
  let memberA2: TestUser;
  let fabFormatId: string;

  const TEST_SUBJECT = "test_subject";

  beforeAll(() => {
    prisma = createTestPrismaClient();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  beforeEach(async () => {
    const client = createDatabaseClient();
    await client.connect();
    await resetDatabase(client);
    await client.end();

    await createGame(prisma, { id: "flesh-and-blood", key: "flesh_and_blood", name: "FaB" });
    teamA = await createTeam(prisma, { name: "Alpha", gameId: "flesh-and-blood" });
    teamB = await createTeam(prisma, { name: "Bravo", gameId: "flesh-and-blood" });
    memberA = await createUser(prisma, { username: "member_a" });
    memberA2 = await createUser(prisma, { username: "member_a2" });
    await addMembership(prisma, { teamId: teamA.id, userId: memberA.id, role: "member" });
    await addMembership(prisma, { teamId: teamA.id, userId: memberA2.id, role: "member" });
    fabFormatId = (await createFormat(prisma, { gameId: "flesh-and-blood", key: "cc" })).id;
  });

  function teamContextFor(team: TestTeam, user: TestUser): TeamContext {
    return { userId: user.id, teamId: team.id, role: "member", gameId: "flesh-and-blood" };
  }

  /** A resolver for the test-only subject type, backed by a deck row for realism. */
  function testResolver(): AttachableSubjectResolver {
    return {
      subjectType: TEST_SUBJECT,
      resolve: async (team, subjectId) => {
        const deck = await prisma.deck.findFirst({
          where: { id: subjectId, teamId: team.teamId },
          select: { archivedAt: true, visibility: true },
        });
        if (!deck) {
          return null;
        }
        return { canComment: deck.archivedAt === null, isTeamVisible: deck.visibility === "team" };
      },
    };
  }

  function buildService(): CollaborationService {
    const registry = new SubjectResolverRegistry();
    registry.register(testResolver());
    const scopedFor = (team: TeamContext) =>
      new TeamScopedPrisma(prisma as unknown as PrismaService, {
        teamContext: team,
      } as RequestWithTenantContext);
    // Each call builds a scoped client from the passed team context; we bind one
    // team's context here since a single service call uses one team.
    const scoped = scopedFor(teamContextFor(teamA, memberA));
    const activity = new CollaborationActivityService(scoped, registry);
    return new CollaborationService(scoped, registry, activity);
  }

  it("runs the full comment/mention/activity path for a non-deck subject type", async () => {
    const subject = await createDeck(prisma, {
      teamId: teamA.id,
      ownerId: memberA.id,
      formatId: fabFormatId,
    });
    const service = buildService();
    const team = teamContextFor(teamA, memberA);

    const comment = await service.create(team, {
      subjectType: TEST_SUBJECT,
      subjectId: subject.id,
      body: "polymorphic hello @member_a2",
    } as unknown as CreateCommentInput);
    expect(comment.subjectType).toBe(TEST_SUBJECT);

    // Same code path produced a comment, a mention, a notification, and activity.
    expect(await prisma.comment.count({ where: { subjectType: TEST_SUBJECT } })).toBe(1);
    expect(await prisma.mention.count()).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: memberA2.id, subjectType: TEST_SUBJECT },
      }),
    ).toBe(1);
    expect(
      await prisma.activityEvent.count({
        where: { verb: "commented", subjectType: TEST_SUBJECT },
      }),
    ).toBe(1);

    const thread = await service.listThread(team, {
      subjectType: TEST_SUBJECT,
      subjectId: subject.id,
    } as unknown as CommentThreadQuery);
    expect(thread.data).toHaveLength(1);
  });

  it("rejects a foreign-team subject through the same resolver contract (404)", async () => {
    const foreign = await createDeck(prisma, {
      teamId: teamB.id,
      ownerId: memberA.id,
      formatId: fabFormatId,
    });
    const service = buildService();
    const team = teamContextFor(teamA, memberA);
    await expect(
      service.create(team, {
        subjectType: TEST_SUBJECT,
        subjectId: foreign.id,
        body: "cross-tenant",
      } as unknown as CreateCommentInput),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
