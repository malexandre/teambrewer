import { Module } from "@nestjs/common";

import { CollaborationModule } from "../collaboration/collaboration.module.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { GameLogSubjectResolver } from "./game-log-subject-resolver.js";
import { GameLogsController } from "./game-logs.controller.js";
import { GameLogsService } from "./game-logs.service.js";

/**
 * Game logging (phase-06, ADR-0005): team-scoped records of individual games with
 * the structured confidence factors that derive a server-authoritative
 * `confidenceWeight` — the source of truth for later matchup aggregates. Imports
 * {@link TenancyModule} for team-scoped data access + the {@link TeamContextGuard},
 * and {@link CollaborationModule} so game logs emit activity and register as a
 * commentable subject via {@link GameLogSubjectResolver}.
 */
@Module({
  imports: [TenancyModule, CollaborationModule],
  controllers: [GameLogsController],
  providers: [GameLogsService, GameLogSubjectResolver],
  // Exported so the dashboard module (phase-11) can compose recent-results reads.
  exports: [GameLogsService],
})
export class GameLogsModule {}
