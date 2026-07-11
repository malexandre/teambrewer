import { Global, Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service.js";

/**
 * Global so every feature module can inject `PrismaService` without re-importing.
 * Team-owned modules must go through the team-scoped data-access helper rather
 * than using this client directly for tenant data (see multi-tenancy.md).
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
