import type { INestApplication } from "@nestjs/common";
import { Client } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient, createUser } from "../../test/factories.js";
import { createApiTestApp } from "../../test/nest-app.js";
import { AppModule } from "../app.module.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { InviteTokenService } from "../auth/invite-token.service.js";
import type { PrismaClient } from "../generated/prisma/client.js";

const STRONG_PASSWORD = "a-strong-passphrase-01";

describe("Onboarding link consumption (integration)", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let inviteTokens: InviteTokenService;

  beforeAll(async () => {
    app = await createApiTestApp([AppModule]);
    prisma = createTestPrismaClient();
    inviteTokens = new InviteTokenService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  beforeEach(async () => {
    const resetClient: Client = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();
  });

  const http = () => request(app.getHttpServer());

  it("consumes a setup link, sets the password, and returns the username", async () => {
    const user = await createUser(prisma, { username: "rookie", authMethod: "password_totp" });
    const { rawToken } = await inviteTokens.issue({ userId: user.id, purpose: "setup" });

    const response = await http()
      .post(`/api/onboarding/setup/${rawToken}`)
      .send({ password: STRONG_PASSWORD });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ username: "rookie" });
    const credential = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
      select: { password: true },
    });
    expect(credential?.password).toBeTruthy();
  });

  it("reports an invite link valid on load and invalid once consumed", async () => {
    const user = await createUser(prisma, { username: "peeker", authMethod: "password_totp" });
    const { rawToken } = await inviteTokens.issue({ userId: user.id, purpose: "setup" });

    const before = await http().get(`/api/onboarding/invite/${rawToken}`);
    expect(before.status).toBe(200);
    expect(before.body).toEqual({ valid: true });

    await http().post(`/api/onboarding/setup/${rawToken}`).send({ password: STRONG_PASSWORD });

    const after = await http().get(`/api/onboarding/invite/${rawToken}`);
    expect(after.status).toBe(200);
    expect(after.body).toEqual({ valid: false });
  });

  it("reports an unknown invite token as invalid without erroring (no enumeration)", async () => {
    const response = await http().get("/api/onboarding/invite/not-a-real-token");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ valid: false });
  });

  it("rejects a used or unknown setup token (400 INVALID_TOKEN, no enumeration)", async () => {
    const user = await createUser(prisma, { username: "abandoner" });
    const { rawToken } = await inviteTokens.issue({ userId: user.id, purpose: "setup" });
    await http().post(`/api/onboarding/setup/${rawToken}`).send({ password: STRONG_PASSWORD });

    const reuse = await http()
      .post(`/api/onboarding/setup/${rawToken}`)
      .send({ password: STRONG_PASSWORD });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe("INVALID_TOKEN");

    const unknown = await http()
      .post("/api/onboarding/setup/not-a-real-token")
      .send({ password: STRONG_PASSWORD });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe("INVALID_TOKEN");
  });

  it("rejects a password that fails the shared policy (400 VALIDATION_FAILED)", async () => {
    const user = await createUser(prisma, { username: "weak" });
    const { rawToken } = await inviteTokens.issue({ userId: user.id, purpose: "setup" });

    const response = await http()
      .post(`/api/onboarding/setup/${rawToken}`)
      .send({ password: "short" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("consumes a reset link and leaves TOTP untouched", async () => {
    const user = await createUser(prisma, {
      username: "forgetful",
      authMethod: "password_totp",
      twoFactorEnabled: true,
    });
    const { rawToken } = await inviteTokens.issue({ userId: user.id, purpose: "reset" });

    const response = await http()
      .post(`/api/onboarding/reset/${rawToken}`)
      .send({ password: STRONG_PASSWORD });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ username: "forgetful" });
    const after = await prisma.user.findUnique({
      where: { id: user.id },
      select: { twoFactorEnabled: true },
    });
    expect(after?.twoFactorEnabled).toBe(true);
  });
});
