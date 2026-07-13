import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient, createUser, type TestUser } from "../../test/factories.js";
import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";
import type { PrismaClient } from "../generated/prisma/client.js";

describe("Games catalog endpoint (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let user: TestUser;

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
    user = await createUser(prisma, { username: "catalog_reader" });
  });

  it("returns the supported-games catalog to any authenticated caller", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/games")
      .set("x-test-user-id", user.id);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: [
        { id: "flesh-and-blood", key: "flesh_and_blood", name: "Flesh and Blood" },
        { id: "riftbound", key: "riftbound", name: "Riftbound" },
      ],
    });
  });

  it("requires authentication (401)", async () => {
    const response = await request(app.getHttpServer()).get("/api/games");
    expect(response.status).toBe(401);
  });
});
