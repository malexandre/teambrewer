import { Client } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, resetDatabase } from "../../test/database.js";
import { createTestPrismaClient, createUser } from "../../test/factories.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { InvalidInviteTokenError, InviteTokenService } from "./invite-token.service.js";

describe("InviteTokenService", () => {
  let prisma: PrismaClient;
  let service: InviteTokenService;
  let userId: string;

  beforeEach(async () => {
    const resetClient: Client = createDatabaseClient();
    await resetClient.connect();
    await resetDatabase(resetClient);
    await resetClient.end();

    prisma = createTestPrismaClient();
    service = new InviteTokenService(prisma as unknown as PrismaService);
    const user = await createUser(prisma);
    userId = user.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("stores only a hash of the raw token, never the token itself", async () => {
    const { rawToken } = await service.issue({ userId, purpose: "setup" });

    const stored = await prisma.inviteToken.findFirstOrThrow({ where: { userId } });
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(stored.tokenHash).toBe(InviteTokenService.hashToken(rawToken));
    expect(stored.usedAt).toBeNull();
  });

  it("revoke invalidates outstanding links so they can no longer be consumed", async () => {
    const { rawToken } = await service.issue({ userId, purpose: "setup" });

    const revokedCount = await service.revoke(userId);
    expect(revokedCount).toBe(1);

    await expect(service.consume(rawToken, "setup")).rejects.toBeInstanceOf(
      InvalidInviteTokenError,
    );
    // Idempotent: a second revoke touches nothing.
    expect(await service.revoke(userId)).toBe(0);
  });

  it("inspect reports validity without consuming the token", async () => {
    const { rawToken } = await service.issue({ userId, purpose: "setup" });

    expect(await service.inspect(rawToken)).toEqual({ purpose: "setup" });
    // Inspect must not consume: the token still works afterwards.
    expect(await service.inspect(rawToken)).toEqual({ purpose: "setup" });

    expect(await service.inspect("not-a-real-token")).toBeNull();

    await service.consume(rawToken, "setup");
    expect(await service.inspect(rawToken)).toBeNull();
  });

  it("consumes a valid token exactly once", async () => {
    const { rawToken } = await service.issue({
      userId,
      teamId: null,
      purpose: "setup",
    });

    const consumed = await service.consume(rawToken, "setup");
    expect(consumed.userId).toBe(userId);
    expect(consumed.purpose).toBe("setup");

    await expect(service.consume(rawToken, "setup")).rejects.toBeInstanceOf(
      InvalidInviteTokenError,
    );
  });

  it("rejects an expired token", async () => {
    const issuedAt = new Date("2026-01-01T00:00:00.000Z");
    const { rawToken, expiresAt } = await service.issue({
      userId,
      purpose: "reset",
      now: issuedAt,
    });

    const afterExpiry = new Date(expiresAt.getTime() + 1);
    await expect(service.consume(rawToken, "reset", afterExpiry)).rejects.toBeInstanceOf(
      InvalidInviteTokenError,
    );
  });

  it("rejects a token consumed with the wrong purpose", async () => {
    const { rawToken } = await service.issue({ userId, purpose: "setup" });

    await expect(service.consume(rawToken, "reset")).rejects.toBeInstanceOf(
      InvalidInviteTokenError,
    );
  });

  it("rejects an unknown token without disclosing existence", async () => {
    await expect(service.consume("not-a-real-token", "setup")).rejects.toBeInstanceOf(
      InvalidInviteTokenError,
    );
  });

  it("invalidates the prior link when a newer one of the same purpose is issued", async () => {
    const first = await service.issue({ userId, purpose: "setup" });
    const second = await service.issue({ userId, purpose: "setup" });

    // The superseded token no longer works...
    await expect(service.consume(first.rawToken, "setup")).rejects.toBeInstanceOf(
      InvalidInviteTokenError,
    );
    // ...but the latest one does.
    const consumed = await service.consume(second.rawToken, "setup");
    expect(consumed.userId).toBe(userId);
  });

  it("does not let a reset link invalidate a setup link (scoped by purpose)", async () => {
    const setup = await service.issue({ userId, purpose: "setup" });
    await service.issue({ userId, purpose: "reset" });

    const consumed = await service.consume(setup.rawToken, "setup");
    expect(consumed.purpose).toBe("setup");
  });
});
