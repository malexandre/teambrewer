import { Module } from "@nestjs/common";

import { TeamContextGuard } from "./team-context.guard.js";
import { TeamScopedPrisma } from "./team-scoped-prisma.js";

/**
 * The tenancy backbone: the guard that verifies the active team and the
 * request-scoped, team-scoped data-access helper. Exported so feature modules
 * can apply the guard and inject the scoped client (PrismaModule is global, so
 * PrismaService is already available).
 */
@Module({
  providers: [TeamContextGuard, TeamScopedPrisma],
  exports: [TeamContextGuard, TeamScopedPrisma],
})
export class TenancyModule {}
