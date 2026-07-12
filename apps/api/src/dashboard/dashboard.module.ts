import { Module } from "@nestjs/common";

import { CollaborationModule } from "../collaboration/collaboration.module.js";
import { EventsModule } from "../events/events.module.js";
import { GameLogsModule } from "../game-logs/game-logs.module.js";
import { MatchupsModule } from "../matchups/matchups.module.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { TestingQueueModule } from "../testing-queue/testing-queue.module.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

/**
 * Dashboard (phase-11): a read-only aggregation surface that composes the existing
 * events, matchups/coverage, testing-queue, game-logging, and collaboration services
 * into a personal + team "what should I do next?" overview. It owns no data and adds
 * no Prisma model — it imports the source modules (which export their services) plus
 * {@link TenancyModule} for the {@link TeamContextGuard}.
 */
@Module({
  imports: [
    TenancyModule,
    MatchupsModule,
    EventsModule,
    GameLogsModule,
    TestingQueueModule,
    CollaborationModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
