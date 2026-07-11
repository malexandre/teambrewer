import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";

import type { AuthMethod } from "@teambrewer/shared";

import { PrismaService } from "../prisma/prisma.service.js";
import { type Auth, createAuth } from "./auth.js";

export interface ProvisionAccountInput {
  username: string;
  displayName: string;
  authMethod: AuthMethod;
  isInstanceAdmin?: boolean;
  discordUserId?: string;
  discordUsername?: string;
}

/**
 * Owns the Better Auth instance and the server-side account provisioning that
 * invite-only, no-email auth needs. Accounts are created directly (Prisma) —
 * open sign-up is disabled — and passwords are hashed with Better Auth's own
 * hasher so sign-in verifies them. Sessions, TOTP, backup codes, and (phase-04)
 * Discord are handled by Better Auth's own handlers/API.
 */
@Injectable()
export class AuthService {
  private readonly authInstance: Auth;

  constructor(private readonly prisma: PrismaService) {
    // Built eagerly (no DB access here) so main.ts can mount the Better Auth
    // handlers on Express before the app starts listening.
    this.authInstance = createAuth(this.prisma);
  }

  get instance(): Auth {
    return this.authInstance;
  }

  get api(): Auth["api"] {
    return this.authInstance.api;
  }

  /** Synthetic, non-routable email so Better Auth's schema is satisfied (ADR-0003). */
  static syntheticEmail(username: string): string {
    return `${username.toLowerCase()}@users.teambrewer.local`;
  }

  /**
   * Create an account (no password yet for password accounts — that is set when
   * the user consumes their setup link). Fails if the username or Discord id is
   * already taken (unique constraints).
   */
  async provisionAccount(input: ProvisionAccountInput): Promise<{ userId: string }> {
    const user = await this.prisma.user.create({
      data: {
        id: randomUUID(),
        name: input.displayName,
        email: AuthService.syntheticEmail(input.username),
        emailVerified: true,
        username: input.username,
        displayUsername: input.username,
        displayName: input.displayName,
        isInstanceAdmin: input.isInstanceAdmin ?? false,
        authMethod: input.authMethod,
        twoFactorEnabled: false,
        discordUserId: input.discordUserId ?? null,
        discordUsername: input.discordUsername ?? null,
      },
      select: { id: true },
    });
    return { userId: user.id };
  }

  /**
   * Set (or replace) a password account's credential, hashing with Better Auth's
   * hasher so sign-in verifies it. Used by the setup and reset flows.
   */
  async setPassword(userId: string, password: string): Promise<void> {
    const context = await this.authInstance.$context;
    const passwordHash = await context.password.hash(password);

    const existing = await this.prisma.account.findFirst({
      where: { userId, providerId: "credential" },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.account.update({
        where: { id: existing.id },
        data: { password: passwordHash },
      });
      return;
    }
    await this.prisma.account.create({
      data: {
        id: randomUUID(),
        userId,
        providerId: "credential",
        accountId: userId,
        password: passwordHash,
      },
    });
  }

  /** Resolve the authenticated session for an incoming request's headers. */
  async getSession(headers: Headers): Promise<Awaited<ReturnType<Auth["api"]["getSession"]>>> {
    return this.api.getSession({ headers });
  }

  /**
   * Resolve the authoritative user behind a request's session, reading the
   * security-relevant fields from the database rather than trusting the session
   * payload. Returns null when there is no session.
   */
  async resolveSessionUser(headers: Headers): Promise<{
    id: string;
    authMethod: string;
    twoFactorEnabled: boolean;
    isInstanceAdmin: boolean;
  } | null> {
    const session = await this.getSession(headers);
    if (!session?.user) {
      return null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        authMethod: true,
        twoFactorEnabled: true,
        isInstanceAdmin: true,
      },
    });
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      authMethod: user.authMethod,
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      isInstanceAdmin: user.isInstanceAdmin,
    };
  }
}
