import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient, createUser } from "../../test/factories.js";
import { AuthService } from "../auth/auth.service.js";
import { InviteTokenService } from "../auth/invite-token.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { LocalBootstrapService } from "./local-bootstrap.service.js";

// Set before any AuthService is constructed (createAuth reads these at `new`).
process.env["BETTER_AUTH_SECRET"] ??= "test-better-auth-secret-please-change-0123456789";
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3000";

type PrismaClient = ReturnType<typeof createTestPrismaClient>;

const SEED_ADMIN = { username: "admin", displayName: "Local Admin" };

describe("LocalBootstrapService", () => {
  let prisma: PrismaClient;
  let service: LocalBootstrapService;
  let authService: AuthService;

  beforeEach(async () => {
    const resetClient: Client = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();

    prisma = createTestPrismaClient();
    authService = new AuthService(prisma as unknown as PrismaService);
    const inviteTokens = new InviteTokenService(prisma as unknown as PrismaService);
    service = new LocalBootstrapService(
      prisma as unknown as PrismaService,
      authService,
      inviteTokens,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("creates the instance-admin and issues a team-less setup link on a fresh database", async () => {
    const result = await service.bootstrapInstanceAdmin(SEED_ADMIN);

    expect(result.status).toBe("setup_link_issued");
    if (result.status !== "setup_link_issued") {
      throw new Error("unreachable");
    }
    expect(result.createdNewUser).toBe(true);
    expect(result.promotedToInstanceAdmin).toBe(false);
    expect(result.link.purpose).toBe("setup");
    expect(result.link.url).toContain("/setup/");

    const user = await prisma.user.findFirstOrThrow({ where: { username: "admin" } });
    expect(user.isInstanceAdmin).toBe(true);
    expect(user.displayName).toBe("Local Admin");

    // The token targets the user with no team (the admin has none yet).
    const token = await prisma.inviteToken.findFirstOrThrow({
      where: { userId: user.id, purpose: "setup" },
    });
    expect(token.teamId).toBeNull();
    expect(token.usedAt).toBeNull();
  });

  it("reports already-provisioned and issues no new link once a password is set", async () => {
    await service.bootstrapInstanceAdmin(SEED_ADMIN);
    const user = await prisma.user.findFirstOrThrow({ where: { username: "admin" } });
    await authService.setPassword(user.id, "correct-horse-battery-staple");

    const tokensBefore = await prisma.inviteToken.count({
      where: { userId: user.id, purpose: "setup" },
    });

    const result = await service.bootstrapInstanceAdmin(SEED_ADMIN);

    expect(result.status).toBe("already_provisioned");
    if (result.status !== "already_provisioned") {
      throw new Error("unreachable");
    }
    expect(result.signInUrl).toBe(process.env["WEB_ORIGIN"] ?? "http://localhost:5173");

    // No new setup link is minted once onboarding is complete.
    const tokensAfter = await prisma.inviteToken.count({
      where: { userId: user.id, purpose: "setup" },
    });
    expect(tokensAfter).toBe(tokensBefore);
  });

  it("promotes an existing non-admin user with the seed username to instance-admin", async () => {
    const existing = await createUser(prisma, {
      username: "admin",
      displayName: "Someone Else",
      isInstanceAdmin: false,
    });

    const result = await service.bootstrapInstanceAdmin(SEED_ADMIN);

    expect(result.promotedToInstanceAdmin).toBe(true);
    expect(result.status).toBe("setup_link_issued");

    const user = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(user.isInstanceAdmin).toBe(true);
  });

  it("supersedes an earlier unused setup link when re-run before a password is set", async () => {
    const first = await service.bootstrapInstanceAdmin(SEED_ADMIN);
    const second = await service.bootstrapInstanceAdmin(SEED_ADMIN);
    if (first.status !== "setup_link_issued" || second.status !== "setup_link_issued") {
      throw new Error("unreachable");
    }
    expect(second.link.url).not.toBe(first.link.url);

    const user = await prisma.user.findFirstOrThrow({ where: { username: "admin" } });
    const unusedTokens = await prisma.inviteToken.count({
      where: { userId: user.id, purpose: "setup", usedAt: null },
    });
    // Issuing a new link invalidates the prior unused one — only the latest works.
    expect(unusedTokens).toBe(1);
  });
});
