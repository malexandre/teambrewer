import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import {
  addMembership,
  createGame,
  createTeam,
  createTestPrismaClient,
  createUser,
  type TestTeam,
  type TestUser,
} from "../../test/factories.js";
import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";
import type { PrismaClient } from "../generated/prisma/client.js";

describe("Game-config endpoint (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let team: TestTeam;
  let member: TestUser;

  beforeAll(async () => {
    app = await createApiTestApp([AppModule]);
    prisma = createTestPrismaClient();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });
  beforeEach(async () => {
    const client = createDatabaseClient();
    await client.connect();
    await resetDatabase(client);
    await client.end();
    await createGame(prisma, {
      id: "flesh-and-blood",
      key: "flesh_and_blood",
      name: "Flesh and Blood",
    });
    team = await createTeam(prisma, { name: "Alpha", gameId: "flesh-and-blood" });
    member = await createUser(prisma, { username: "member_a" });
    await addMembership(prisma, { teamId: team.id, userId: member.id, role: "member" });
  });

  it("returns the team's game config with the adapter's defaultBestOf", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/game-config")
      .set("x-test-user-id", member.id)
      .set("x-team-id", team.id);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      gameId: "flesh-and-blood",
      identityLabel: "Hero",
      defaultBestOf: 1,
    });
  });

  it("requires authentication (401)", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/game-config")
      .set("x-team-id", team.id);
    expect(response.status).toBe(401);
  });
});
