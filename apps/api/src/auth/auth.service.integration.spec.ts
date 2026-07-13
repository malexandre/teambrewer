import { authenticator } from "otplib";
import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient } from "../../test/factories.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { AuthService } from "./auth.service.js";

// Set before any AuthService is constructed (createAuth reads these at `new`).
process.env["BETTER_AUTH_SECRET"] ??= "test-better-auth-secret-please-change-0123456789";
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3000";

type PrismaClient = ReturnType<typeof createTestPrismaClient>;

function totpCodeFromUri(totpUri: string): string {
  const secret = new URL(totpUri).searchParams.get("secret");
  if (!secret) {
    throw new Error("totpURI did not contain a secret");
  }
  return authenticator.generate(secret);
}

/** Build a Cookie request header from a Set-Cookie response header list. */
function cookieHeaderFrom(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((setCookie) => setCookie.split(";")[0])
    .join("; ");
}

describe("AuthService", () => {
  let prisma: PrismaClient;
  let service: AuthService;

  beforeEach(async () => {
    const resetClient: Client = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();

    prisma = createTestPrismaClient();
    service = new AuthService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("provisions an account with the TeamBrewer domain fields and a synthetic email", async () => {
    const { userId } = await service.provisionAccount({
      username: "meta_caller",
      displayName: "Meta Caller",
      authMethod: "password_totp",
      isInstanceAdmin: true,
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.username).toBe("meta_caller");
    expect(user.displayName).toBe("Meta Caller");
    expect(user.isInstanceAdmin).toBe(true);
    expect(user.email).toBe("meta_caller@users.teambrewer.local");
    expect(user.twoFactorEnabled).toBe(false);
  });

  it("signs in with username + password after setPassword, and getSession resolves the user", async () => {
    const { userId } = await service.provisionAccount({
      username: "caller",
      displayName: "Caller",
      authMethod: "password_totp",
    });
    await service.setPassword(userId, "correct-horse-battery-staple");

    const { headers, response } = await service.api.signInUsername({
      body: { username: "caller", password: "correct-horse-battery-staple" },
      returnHeaders: true,
    });
    expect((response as { token?: string }).token).toBeTruthy();

    const session = await service.getSession(new Headers({ cookie: cookieHeaderFrom(headers) }));
    expect(session?.user.id).toBe(userId);
  });

  it("normalises the stored username so a mixed-case username can sign in", async () => {
    // Better Auth's username plugin looks up by the lowercased username, so the
    // `username` column must be normalised; `displayUsername` keeps the casing.
    const { userId } = await service.provisionAccount({
      username: "MixedCase",
      displayName: "Mixed Case",
      authMethod: "password_totp",
    });
    await service.setPassword(userId, "correct-horse-battery-staple");

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true, displayUsername: true },
    });
    expect(stored.username).toBe("mixedcase");
    expect(stored.displayUsername).toBe("MixedCase");

    const { response } = await service.api.signInUsername({
      body: { username: "MixedCase", password: "correct-horse-battery-staple" },
      returnHeaders: true,
    });
    expect((response as { token?: string }).token).toBeTruthy();
  });

  it("rejects sign-in with the wrong password", async () => {
    const { userId } = await service.provisionAccount({
      username: "caller",
      displayName: "Caller",
      authMethod: "password_totp",
    });
    await service.setPassword(userId, "correct-horse-battery-staple");

    await expect(
      service.api.signInUsername({
        body: { username: "caller", password: "wrong-password-entirely" },
      }),
    ).rejects.toBeDefined();
  });

  it("enrols TOTP and, once enabled, gates password login behind a 2FA challenge", async () => {
    const { userId } = await service.provisionAccount({
      username: "caller",
      displayName: "Caller",
      authMethod: "password_totp",
    });
    await service.setPassword(userId, "correct-horse-battery-staple");

    const { headers } = await service.api.signInUsername({
      body: { username: "caller", password: "correct-horse-battery-staple" },
      returnHeaders: true,
    });
    const authedHeaders = new Headers({ cookie: cookieHeaderFrom(headers) });

    const enrol = await service.api.enableTwoFactor({
      body: { password: "correct-horse-battery-staple" },
      headers: authedHeaders,
    });
    expect(enrol.totpURI).toContain("otpauth://");
    expect(enrol.backupCodes.length).toBeGreaterThan(0);

    await service.api.verifyTOTP({
      body: { code: totpCodeFromUri(enrol.totpURI) },
      headers: authedHeaders,
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.twoFactorEnabled).toBe(true);

    // With TOTP enabled, a fresh password sign-in must not hand out a session
    // outright — it returns a two-factor challenge instead.
    const gated = await service.api.signInUsername({
      body: { username: "caller", password: "correct-horse-battery-staple" },
    });
    expect((gated as { twoFactorRedirect?: boolean }).twoFactorRedirect).toBe(true);
    expect((gated as { token?: string }).token).toBeFalsy();
  });
});
