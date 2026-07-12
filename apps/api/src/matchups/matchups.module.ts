import { Module } from "@nestjs/common";

import { TenancyModule } from "../tenancy/tenancy.module.js";
import { MatchupsController } from "./matchups.controller.js";
import { MatchupsService } from "./matchups.service.js";

/**
 * Matchups & coverage (phase-07, ADR-0005): the signature confidence-weighted
 * matchup reads and gauntlet coverage tracker, derived read-only from the team's
 * `GameLog`s. Imports {@link TenancyModule} for team-scoped data access + the
 * {@link TeamContextGuard}. No collaboration wiring — aggregates are not a
 * commentable subject.
 */
@Module({
  imports: [TenancyModule],
  controllers: [MatchupsController],
  providers: [MatchupsService],
})
export class MatchupsModule {}
