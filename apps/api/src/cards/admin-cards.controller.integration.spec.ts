import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createGame, createTestPrismaClient, createUser, type TestUser } from "../../test/factories.js";
import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { FabCardSourceClient } from "../games/flesh-and-blood/fab-card-source.client.js";
import { FLESH_AND_BLOOD_CARD_FIXTURE } from "../games/flesh-and-blood/flesh-and-blood.fixture.js";

/**
 * Authorization + behavior for the instance-admin sync trigger. The FaB source
 * client is overridden with the fixture so the endpoint never hits the network.
 */
describe("POST /api/admin/card-data/sync (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let member: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    app = await createApiTestApp([AppModule], (builder) =>
      builder.overrideProvider(FabCardSourceClient).useValue({
        fetchRawCards: async () => FLESH_AND_BLOOD_CARD_FIXTURE,
        sourceUrl: "https://source.test/flesh-and-blood/cards.json",
        sourceVersion: "v-test",
      }),
    );
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
    await createGame(prisma, { id: "flesh-and-blood", key: "flesh_and_blood", name: "Flesh and Blood" });
    member = await createUser(prisma);
    admin = await createUser(prisma, { isInstanceAdmin: true });
  });

  const http = () => request(app.getHttpServer());

  it("rejects a non-admin (403)", async () => {
    const response = await http().post("/api/admin/card-data/sync").set("x-test-user-id", member.id);
    expect(response.status).toBe(403);
    expect(await prisma.card.count()).toBe(0);
  });

  it("rejects an unauthenticated request (401)", async () => {
    const response = await http().post("/api/admin/card-data/sync");
    expect(response.status).toBe(401);
  });

  it("runs the sync for an instance-admin and reports the result", async () => {
    const response = await http()
      .post("/api/admin/card-data/sync")
      .set("x-test-user-id", admin.id)
      .set("x-test-instance-admin", "true");

    expect(response.status).toBe(201);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].gameId).toBe("flesh-and-blood");
    expect(response.body.data[0].sourceVersion).toBe("v-test");
    expect(await prisma.card.count()).toBe(FLESH_AND_BLOOD_CARD_FIXTURE.length);
  });
});
