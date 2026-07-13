import { Injectable, NotFoundException } from "@nestjs/common";

import { errorCode, type InviteStatus, type OnboardingResult } from "@teambrewer/shared";

import { AuthService } from "../auth/auth.service.js";
import { InviteTokenService } from "../auth/invite-token.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Consumes single-use setup/reset links (no email — ADR-0003). Both set the
 * account's password; the web app then signs the user in with it and (for setup)
 * drives the mandatory TOTP enrolment via Better Auth. The account username is
 * returned so the client can complete sign-in without another lookup.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly inviteTokens: InviteTokenService,
  ) {}

  /** Non-consuming validity check so the claim page can react on load, not just on submit. */
  async inspectInvite(token: string): Promise<InviteStatus> {
    const result = await this.inviteTokens.inspect(token);
    return { valid: result !== null };
  }

  /** Set the initial password for a new account. TOTP enrolment follows on the client. */
  async completeSetup(token: string, password: string): Promise<OnboardingResult> {
    return this.consumeAndSetPassword(token, "setup", password);
  }

  /** Set a new password from a reset link. TOTP is unaffected. */
  async completeReset(token: string, password: string): Promise<OnboardingResult> {
    return this.consumeAndSetPassword(token, "reset", password);
  }

  private async consumeAndSetPassword(
    token: string,
    purpose: "setup" | "reset",
    password: string,
  ): Promise<OnboardingResult> {
    const consumed = await this.inviteTokens.consume(token, purpose);
    if (!consumed.userId) {
      throw new NotFoundException({
        error: { code: errorCode.invalidToken, message: "This link is invalid or has expired." },
      });
    }
    await this.authService.setPassword(consumed.userId, password);
    const user = await this.prisma.user.findUnique({
      where: { id: consumed.userId },
      select: { username: true },
    });
    if (!user?.username) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Account not found." },
      });
    }
    return { username: user.username };
  }
}
