import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient } from "../../test/factories.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { AuthService } from "./auth.service.js";

// Better Auth reads env at construction (createAuth). Force a tiny sign-in limit
// so the test proves the configured threshold produces a 429 without needing to
// send hundreds of requests. Set BEFORE the AuthService is constructed.
const SIGN_IN_MAX = 3;
process.env["BETTER_AUTH_SECRET"] ??= "test-better-auth-secret-please-change-0123456789";
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3000";
process.env["RATE_LIMIT_AUTH_SIGN_IN_MAX"] = String(SIGN_IN_MAX);
process.env["RATE_LIMIT_AUTH_SIGN_IN_WINDOW_SECONDS"] = "60";

type PrismaClient = ReturnType<typeof createTestPrismaClient>;

/**
 * Drives Better Auth's own request handler (mounted outside the Nest pipeline in
 * production) to prove the sign-in path is rate-limited: after the configured
 * per-window maximum, further sign-in attempts return HTTP 429. This protects
 * against credential brute-forcing (security.md, ADR-0003).
 */
describe("Auth sign-in rate limiting (integration)", () => {
  let prisma: PrismaClient;
  let service: AuthService;

  beforeAll(async () => {
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

  it("returns 429 once sign-in attempts exceed the configured limit", async () => {
    // A single fixed client key so every attempt lands in the same rate-limit
    // bucket; the credentials are intentionally wrong (limiting counts the
    // request regardless of the outcome).
    const attempt = (): Promise<Response> =>
      service.instance.handler(
        new Request("http://localhost:3000/api/auth/sign-in/username", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.7",
          },
          body: JSON.stringify({ username: "nobody", password: "wrong-password-here" }),
        }),
      );

    const statuses: number[] = [];
    for (let index = 0; index < SIGN_IN_MAX + 2; index += 1) {
      const response = await attempt();
      statuses.push(response.status);
    }

    // The first SIGN_IN_MAX attempts are processed (401 unauthorized); the ones
    // beyond the window maximum are refused with 429.
    expect(statuses.slice(0, SIGN_IN_MAX).every((status) => status !== 429)).toBe(true);
    expect(statuses).toContain(429);
  });
});
