import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";

import type { RequestWithTenantContext } from "../tenancy/team-context.js";
import { AuthService } from "./auth.service.js";

/**
 * A password account may reach app data only once TOTP is enabled (the mandatory
 * 2FA gate, security.md). Discord accounts have no app-side TOTP. An account
 * that has set a password but not yet enrolled TOTP therefore holds a session
 * (needed to drive enrolment via Better Auth's own handlers) but is NOT treated
 * as authenticated for TeamBrewer's guarded endpoints.
 */
function isFullyAuthenticated(user: { authMethod: string; twoFactorEnabled: boolean }): boolean {
  return user.authMethod === "discord" || user.twoFactorEnabled;
}

/**
 * Global guard that resolves the Better Auth session for each request and, when
 * the account is fully authenticated, attaches `userId` + `isInstanceAdmin` to
 * the request. It never blocks on its own (public routes like login/setup must
 * pass through); the authorization guards (TeamContextGuard, RoleGuard) enforce
 * 401/403 when `userId` is absent.
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithTenantContext>();

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        headers.set(key, value.join("; "));
      } else if (value !== undefined) {
        headers.set(key, value);
      }
    }

    const user = await this.authService.resolveSessionUser(headers);
    if (user && isFullyAuthenticated(user)) {
      request.userId = user.id;
      request.isInstanceAdmin = user.isInstanceAdmin;
    }

    return true;
  }
}
