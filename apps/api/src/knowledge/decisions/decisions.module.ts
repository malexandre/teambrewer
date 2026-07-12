import { Module } from "@nestjs/common";

import { CollaborationModule } from "../../collaboration/collaboration.module.js";
import { TenancyModule } from "../../tenancy/tenancy.module.js";
import { DecisionSubjectResolver } from "./decision-subject-resolver.js";
import { DecisionsController } from "./decisions.controller.js";
import { DecisionsService } from "./decisions.service.js";

/**
 * Decisions log (phase-10): a structured record of what the team decided and why. Imports
 * {@link TenancyModule} for team-scoped data access + the {@link TeamContextGuard}, and
 * {@link CollaborationModule} so decisions emit activity and register as commentable
 * subjects via their subject resolver.
 */
@Module({
  imports: [TenancyModule, CollaborationModule],
  controllers: [DecisionsController],
  providers: [DecisionsService, DecisionSubjectResolver],
})
export class DecisionsModule {}
