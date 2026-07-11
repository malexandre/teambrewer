import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { RequestWithTenantContext, TeamContext } from "./team-context.js";

/**
 * Injects the verified {@link TeamContext} into a controller handler. Requires
 * {@link TeamContextGuard} to have run first; if it hasn't, this is a wiring bug
 * and we fail loudly rather than silently operate without tenant scoping.
 */
export const CurrentTeam = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TeamContext => {
    const request = context.switchToHttp().getRequest<RequestWithTenantContext>();
    if (!request.teamContext) {
      throw new Error(
        "TeamContextGuard must run before @CurrentTeam() can provide the team context.",
      );
    }
    return request.teamContext;
  },
);
