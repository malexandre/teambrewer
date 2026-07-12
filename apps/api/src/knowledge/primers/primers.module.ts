import { Module } from "@nestjs/common";

import { CollaborationModule } from "../../collaboration/collaboration.module.js";
import { TenancyModule } from "../../tenancy/tenancy.module.js";
import { PrimerSubjectResolver } from "./primer-subject-resolver.js";
import { PrimersController } from "./primers.controller.js";
import { PrimersService } from "./primers.service.js";

/**
 * Primers (phase-10): long-form living documents (deck/matchup/format writeups). Imports
 * {@link TenancyModule} for team-scoped data access + the {@link TeamContextGuard}, and
 * {@link CollaborationModule} so primers emit activity and register as commentable
 * subjects via their subject resolver.
 */
@Module({
  imports: [TenancyModule, CollaborationModule],
  controllers: [PrimersController],
  providers: [PrimersService, PrimerSubjectResolver],
})
export class PrimersModule {}
