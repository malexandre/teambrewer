import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../../test/database.js";
import {
  addMembership,
  createCard,
  createDeck,
  createFormat,
  createGame,
  createHero,
  createTeam,
  createTestPrismaClient,
  createUser,
  type TestTeam,
  type TestUser,
} from "../../../test/factories.js";
import { createApiTestApp } from "../../../test/nest-app.js";
import { AppModule } from "../../app.module.js";
import type { PrismaClient } from "../../generated/prisma/client.js";

/**
 * The phase-12 acceptance test (ADR-0006). With a team bound to Riftbound, every
 * existing feature — decks, metas + tiered deck entries, lightweight events, game
 * logging, and tasks — works through the real HTTP endpoints with no game-specific
 * branching, and reference data + team data stay isolated from a Flesh and Blood
 * team on the same instance. Reference data is set up with the
 * generic factories (the sync path itself is covered by the sync integration
 * test); the point here is that the feature services never assume FaB.
 */
describe("Riftbound cross-game acceptance (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let riftboundTeam: TestTeam;
  let fabTeam: TestTeam;
  let riftboundMember: TestUser;
  let riftboundTeammate: TestUser;
  let fabMember: TestUser;

  let riftboundFormatId: string;
  let legendId: string; // a Riftbound "Legend" identity
  let riftboundCardId: string;
  let seededRiftboundDeckId: string; // for the cross-tenant read test

  const asRiftboundMember = (agent: request.Test): request.Test =>
    agent.set("x-test-user-id", riftboundMember.id).set("x-team-id", riftboundTeam.id);

  beforeAll(async () => {
    app = await createApiTestApp([AppModule]);
    prisma = createTestPrismaClient();

    const client = createDatabaseClient();
    await client.connect();
    await resetDatabase(client);
    await client.end();

    // Two games on one instance, each with its own reference data.
    await createGame(prisma, { id: "riftbound", key: "riftbound", name: "Riftbound" });
    await createGame(prisma, {
      id: "flesh-and-blood",
      key: "flesh_and_blood",
      name: "Flesh and Blood",
    });

    const riftboundFormat = await createFormat(prisma, {
      gameId: "riftbound",
      key: "standard",
      name: "Standard",
      isConstructed: true,
    });
    riftboundFormatId = riftboundFormat.id;
    // A Flesh and Blood format exists on the instance too, to prove it never
    // leaks into the Riftbound team's reference reads.
    await createFormat(prisma, {
      gameId: "flesh-and-blood",
      key: "cc",
      name: "Classic Constructed",
      isConstructed: true,
    });

    // A Riftbound "Legend" identity: Domain -> classes, Region -> talents.
    const legend = await createHero(prisma, {
      gameId: "riftbound",
      name: "Yasuo, the Unforgiven",
      classes: ["Fury", "Order"],
      talents: ["Ionia"],
      startingLife: null,
    });
    legendId = legend.id;
    await createHero(prisma, { gameId: "flesh-and-blood", name: "Briar" });

    const riftboundCard = await createCard(prisma, { gameId: "riftbound", name: "Pakaa Cub" });
    riftboundCardId = riftboundCard.id;

    riftboundTeam = await createTeam(prisma, { name: "Rift Raiders", gameId: "riftbound" });
    fabTeam = await createTeam(prisma, { name: "Blade Breakers", gameId: "flesh-and-blood" });

    riftboundMember = await createUser(prisma, { username: "rift_member" });
    riftboundTeammate = await createUser(prisma, { username: "rift_teammate" });
    fabMember = await createUser(prisma, { username: "fab_member" });
    await addMembership(prisma, {
      teamId: riftboundTeam.id,
      userId: riftboundMember.id,
      role: "team_admin",
    });
    await addMembership(prisma, {
      teamId: riftboundTeam.id,
      userId: riftboundTeammate.id,
      role: "member",
    });
    await addMembership(prisma, { teamId: fabTeam.id, userId: fabMember.id, role: "member" });

    const seeded = await createDeck(prisma, {
      teamId: riftboundTeam.id,
      ownerId: riftboundMember.id,
      formatId: riftboundFormatId,
      gameId: "riftbound",
      heroId: legendId,
      externalUrl: "https://piltoverarchive.com/decks/seeded",
    });
    seededRiftboundDeckId = seeded.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  it("exposes Riftbound config: identity 'Legend' and best-of-three", async () => {
    const response = await asRiftboundMember(request(app.getHttpServer()).get("/api/game-config"));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      gameId: "riftbound",
      identityLabel: "Legend",
      defaultBestOf: 3,
    });
  });

  it("serves only the team's own game reference data (formats + Legends)", async () => {
    const formats = await asRiftboundMember(request(app.getHttpServer()).get("/api/formats"));
    expect(formats.status).toBe(200);
    const formatKeys = formats.body.data.map((format: { key: string }) => format.key);
    expect(formatKeys).toContain("standard");
    expect(formatKeys).not.toContain("cc");

    const heroes = await asRiftboundMember(request(app.getHttpServer()).get("/api/heroes"));
    expect(heroes.status).toBe(200);
    const heroNames = heroes.body.data.map((hero: { name: string }) => hero.name);
    expect(heroNames).toEqual(["Yasuo, the Unforgiven"]);
    expect(heroNames).not.toContain("Briar");
  });

  it("runs the full team workflow for a Riftbound team with no game branching", async () => {
    // Decks — our deck and a teammate's deck, both around a Legend + Riftbound format.
    const ourDeck = await asRiftboundMember(
      request(app.getHttpServer()).post("/api/decks").send({
        name: "Yasuo Tempo",
        formatId: riftboundFormatId,
        heroId: legendId,
        externalUrl: "https://piltoverarchive.com/decks/yasuo-tempo",
      }),
    );
    expect(ourDeck.status).toBe(201);
    const ourDeckId = ourDeck.body.id as string;
    expect(ourDeck.body.status).toBe("exploratory");

    const teammateDeck = await asRiftboundMember(
      request(app.getHttpServer()).post("/api/decks").send({
        name: "Ionia Control",
        formatId: riftboundFormatId,
        heroId: legendId,
        externalUrl: "https://piltoverarchive.com/decks/ionia-control",
      }),
    );
    expect(teammateDeck.status).toBe(201);
    const teammateDeckId = teammateDeck.body.id as string;

    // Meta + a tiered deck entry (the field to beat, target = a Legend). The window
    // spans the game's played-at date so the log auto-suggests this meta.
    const meta = await asRiftboundMember(
      request(app.getHttpServer()).post("/api/metas").send({
        name: "Riftbound Season 1",
        startDate: "2026-06-01",
        endDate: "2026-12-31",
      }),
    );
    expect(meta.status).toBe(201);
    const metaId = meta.body.id as string;

    const deckEntry = await asRiftboundMember(
      request(app.getHttpServer())
        .post(`/api/metas/${metaId}/deck-entries`)
        .send({ tier: "meta_defining", heroId: legendId, label: "Rift Aggro" }),
    );
    expect(deckEntry.status).toBe(201);

    // Game logging — a Bo3 between our deck and the teammate's, linked to the meta.
    const gameLog = await asRiftboundMember(
      request(app.getHttpServer())
        .post("/api/game-logs")
        .send({
          formatId: riftboundFormatId,
          metaId,
          sideA: { pilotUserId: riftboundMember.id, deckId: ourDeckId },
          sideB: { pilotUserId: riftboundTeammate.id, deckId: teammateDeckId },
          firstPlayerSide: "A",
          bestOf: 3,
          result: { gamesWonA: 2, gamesWonB: 0 },
        }),
    );
    expect(gameLog.status).toBe(201);
    expect(gameLog.body.metaId).toBe(metaId);
    // Bo3 with all-best confidence factors -> full weight.
    expect(gameLog.body.confidenceWeight).toBe(1);

    // Tasks — the merged testing-work unit, with an inline +card token (a Riftbound
    // card id) in the description and a teammate assigned.
    const task = await asRiftboundMember(
      request(app.getHttpServer())
        .post("/api/tasks")
        .send({
          title: "Test reach against wide boards",
          description: `Try +[[${riftboundCardId}]] in the go-wide matchups.`,
          deckId: ourDeckId,
          assigneeId: riftboundTeammate.id,
        }),
    );
    expect(task.status).toBe(201);
    expect(task.body.assignee.userId).toBe(riftboundTeammate.id);
    expect(task.body.description).toContain(riftboundCardId);
  });

  it("isolates a Riftbound team from a Flesh and Blood team on the same instance", async () => {
    // A FaB member cannot assume the Riftbound team's context.
    const forgedContext = await request(app.getHttpServer())
      .get("/api/decks")
      .set("x-test-user-id", fabMember.id)
      .set("x-team-id", riftboundTeam.id);
    expect(forgedContext.status).toBe(403);

    // A cross-tenant read of a Riftbound deck from the FaB team returns 404.
    const crossTenantDeck = await request(app.getHttpServer())
      .get(`/api/decks/${seededRiftboundDeckId}`)
      .set("x-test-user-id", fabMember.id)
      .set("x-team-id", fabTeam.id);
    expect(crossTenantDeck.status).toBe(404);

    // The FaB team reads only its own game's reference data (mirror isolation).
    const fabHeroes = await request(app.getHttpServer())
      .get("/api/heroes")
      .set("x-test-user-id", fabMember.id)
      .set("x-team-id", fabTeam.id);
    expect(fabHeroes.status).toBe(200);
    const fabHeroNames = fabHeroes.body.data.map((hero: { name: string }) => hero.name);
    expect(fabHeroNames).toEqual(["Briar"]);
    expect(fabHeroNames).not.toContain("Yasuo, the Unforgiven");
  });
});
