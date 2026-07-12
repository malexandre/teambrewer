import { Module } from "@nestjs/common";

import { CollaborationModule } from "../../collaboration/collaboration.module.js";
import { TenancyModule } from "../../tenancy/tenancy.module.js";
import { PollsController } from "./polls.controller.js";
import { PollsService } from "./polls.service.js";

/**
 * Polls (phase-10): single-choice group votes. Imports {@link TenancyModule} for
 * team-scoped data access + the {@link TeamContextGuard}, and {@link CollaborationModule}
 * for the activity feed. Unlike primers/decisions, polls are activity-tracked but **not**
 * commentable, so no subject resolver is registered.
 */
@Module({
  imports: [TenancyModule, CollaborationModule],
  controllers: [PollsController],
  providers: [PollsService],
})
export class PollsModule {}
