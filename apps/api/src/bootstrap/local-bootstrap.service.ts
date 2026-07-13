import { Injectable } from "@nestjs/common";

import type { GeneratedLink } from "@teambrewer/shared";

import { buildOnboardingLink } from "../admin/onboarding-link.js";
import { AuthService } from "../auth/auth.service.js";
import { InviteTokenService } from "../auth/invite-token.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Outcome of a local-development bootstrap run. Discriminated on `status` so the
 * CLI can print either a setup link to open or a "sign in" message.
 */
export type LocalBootstrapResult =
  | {
      // A fresh instance-admin was created, or an existing one had no password
      // yet, so a single-use setup link is issued to complete onboarding.
      status: "setup_link_issued";
      username: string;
      displayName: string;
      createdNewUser: boolean;
      promotedToInstanceAdmin: boolean;
      link: GeneratedLink;
    }
  | {
      // The admin already has a password; onboarding is done. Nothing to reissue.
      status: "already_provisioned";
      username: string;
      displayName: string;
      promotedToInstanceAdmin: boolean;
      signInUrl: string;
    };

export interface LocalBootstrapOptions {
  username: string;
  displayName: string;
}

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_DISPLAY_NAME = "Local Admin";
const DEFAULT_WEB_ORIGIN = "http://localhost:5173";

/**
 * Bootstraps the first instance-admin for a local, self-hosted instance so a
 * developer can sign in and start creating teams. This is the one path that mints
 * an instance-admin directly (open sign-up is disabled and flipping the flag
 * otherwise needs an existing instance-admin — the chicken-and-egg the product
 * has no UI for). It reuses the real, no-email onboarding flow (ADR-0003): the
 * account is provisioned without a password and a single-use setup link is
 * issued; the developer opens it to set a password and enrol mandatory TOTP.
 *
 * Idempotent — safe to run on every `pnpm start`:
 *  - no such user            → provision as instance-admin + issue a setup link;
 *  - exists, not admin        → promote to instance-admin;
 *  - exists, no password yet  → issue a fresh setup link (supersedes the prior);
 *  - exists, password already → report "already provisioned", issue nothing.
 */
@Injectable()
export class LocalBootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly inviteTokens: InviteTokenService,
  ) {}

  /** Read the seed-admin identity from the environment, falling back to defaults. */
  static optionsFromEnvironment(): LocalBootstrapOptions {
    return {
      username: process.env["SEED_ADMIN_USERNAME"]?.trim() || DEFAULT_ADMIN_USERNAME,
      displayName: process.env["SEED_ADMIN_DISPLAY_NAME"]?.trim() || DEFAULT_ADMIN_DISPLAY_NAME,
    };
  }

  async bootstrapInstanceAdmin(options: LocalBootstrapOptions): Promise<LocalBootstrapResult> {
    const existing = await this.prisma.user.findFirst({
      where: { username: options.username },
      select: { id: true, isInstanceAdmin: true },
    });

    if (!existing) {
      const { userId } = await this.authService.provisionAccount({
        username: options.username,
        displayName: options.displayName,
        authMethod: "password_totp",
        isInstanceAdmin: true,
      });
      const link = await this.issueSetupLink(userId);
      return {
        status: "setup_link_issued",
        username: options.username,
        displayName: options.displayName,
        createdNewUser: true,
        promotedToInstanceAdmin: false,
        link,
      };
    }

    const promotedToInstanceAdmin = !existing.isInstanceAdmin;
    if (promotedToInstanceAdmin) {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { isInstanceAdmin: true },
      });
    }

    if (await this.hasPassword(existing.id)) {
      return {
        status: "already_provisioned",
        username: options.username,
        displayName: options.displayName,
        promotedToInstanceAdmin,
        signInUrl: LocalBootstrapService.webOrigin(),
      };
    }

    const link = await this.issueSetupLink(existing.id);
    return {
      status: "setup_link_issued",
      username: options.username,
      displayName: options.displayName,
      createdNewUser: false,
      promotedToInstanceAdmin,
      link,
    };
  }

  private async issueSetupLink(userId: string): Promise<GeneratedLink> {
    // The bootstrap admin has no team yet — teamId is nullable on the token.
    const { rawToken, expiresAt } = await this.inviteTokens.issue({
      userId,
      teamId: null,
      purpose: "setup",
    });
    return buildOnboardingLink("setup", rawToken, expiresAt);
  }

  private async hasPassword(userId: string): Promise<boolean> {
    const credential = await this.prisma.account.findFirst({
      where: { userId, providerId: "credential" },
      select: { id: true },
    });
    return credential !== null;
  }

  private static webOrigin(): string {
    return process.env["WEB_ORIGIN"] ?? DEFAULT_WEB_ORIGIN;
  }
}
