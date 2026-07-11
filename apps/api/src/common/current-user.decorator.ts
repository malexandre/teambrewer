import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { RequestWithTenantContext } from "../tenancy/team-context.js";

export interface CurrentUserContext {
  userId: string;
  isInstanceAdmin: boolean;
}

/**
 * Injects the authenticated caller ({@link CurrentUserContext}) attached by the
 * AuthenticationGuard. Throws a loud wiring error if used on a route that did not
 * establish authentication first (an authorization guard must run before it).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUserContext => {
    const request = context.switchToHttp().getRequest<RequestWithTenantContext>();
    if (!request.userId) {
      throw new Error(
        "@CurrentUser() used on a route without authentication; apply an authorization guard first.",
      );
    }
    return { userId: request.userId, isInstanceAdmin: request.isInstanceAdmin ?? false };
  },
);
