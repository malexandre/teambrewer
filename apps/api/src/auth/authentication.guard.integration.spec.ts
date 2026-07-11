import type { ExecutionContext } from "@nestjs/common";
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient } from "../../test/factories.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { RequestWithTenantContext } from "../tenancy/team-context.js";
import { AuthService } from "./auth.service.js";
import { AuthenticationGuard } from "./authentication.guard.js";

// Set before any AuthService is constructed (createAuth reads these at `new`).
process.env["BETTER_AUTH_SECRET"] ??= "test-better-auth-secret-please-change-0123456789";
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3000";

type PrismaClient = ReturnType<typeof createTestPrismaClient>;

function cookieHeaderFrom(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0])
    .join("; ");
}

function contextFor(request: Partial<RequestWithTenantContext>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const PASSWORD = "correct-horse-battery-staple";

describe("AuthenticationGuard", () => {
  let prisma: PrismaClient;
  let service: AuthService;
  let guard: AuthenticationGuard;

  beforeEach(async () => {
    const resetClient: Client = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();

    prisma = createTestPrismaClient();
    service = new AuthService(prisma as unknown as PrismaService);
    guard = new AuthenticationGuard(service);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function signInCookie(username: string): Promise<string> {
    const { headers } = await service.api.signInUsername({
      body: { username, password: PASSWORD },
      returnHeaders: true,
    });
    return cookieHeaderFrom(headers);
  }

  it("attaches userId and isInstanceAdmin for a fully authenticated (TOTP-enabled) account", async () => {
    // The enrolment flow itself is covered by the AuthService test; here we set
    // the enrolled state directly and assert the guard honours it, using a fresh
    // valid session cookie.
    const { userId } = await service.provisionAccount({
      username: "caller",
      displayName: "Caller",
      authMethod: "password_totp",
      isInstanceAdmin: true,
    });
    await service.setPassword(userId, PASSWORD);
    const cookie = await signInCookie("caller");
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    const request = { headers: { cookie } } as unknown as RequestWithTenantContext;
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.userId).toBe(userId);
    expect(request.isInstanceAdmin).toBe(true);
  });

  it("does NOT authenticate a password account that has not yet enrolled TOTP (the 2FA gate)", async () => {
    const { userId } = await service.provisionAccount({
      username: "caller",
      displayName: "Caller",
      authMethod: "password_totp",
    });
    await service.setPassword(userId, PASSWORD);
    const cookie = await signInCookie("caller");

    const request = { headers: { cookie } } as unknown as RequestWithTenantContext;
    await guard.canActivate(contextFor(request));
    expect(request.userId).toBeUndefined();
  });

  it("leaves the request unauthenticated when there is no session", async () => {
    const request = { headers: {} } as unknown as RequestWithTenantContext;
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.userId).toBeUndefined();
  });
});
