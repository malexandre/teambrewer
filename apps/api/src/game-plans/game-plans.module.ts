import { Module } from "@nestjs/common";

import { CollaborationModule } from "../collaboration/collaboration.module.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { GamePlansController } from "./game-plans.controller.js";
import { GamePlansService } from "./game-plans.service.js";
import { MatchupGamePlanSubjectResolver } from "./matchup-game-plan-subject-resolver.js";

/**
 * Game-plans (phase-09): a written matchup game-plan per (our deck × opponent
 * archetype), with a single canonical plan per matchup key. Imports {@link
 * TenancyModule} for team-scoped data access + the {@link TeamContextGuard}, and
 * {@link CollaborationModule} so plans emit activity and register as commentable
 * subjects via their subject resolver.
 */
@Module({
  imports: [TenancyModule, CollaborationModule],
  controllers: [GamePlansController],
  providers: [GamePlansService, MatchupGamePlanSubjectResolver],
})
export class GamePlansModule {}
