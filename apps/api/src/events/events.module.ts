import { Module } from "@nestjs/common";

import { TenancyModule } from "../tenancy/tenancy.module.js";
import { EventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";

/**
 * Events (meta-pivot redesign, WS-5): a lightweight social board — team-scoped
 * get-togethers with an optional meta link and per-member RSVP. The organizing hub
 * moved to the Meta, so events no longer carry a gauntlet, deck selections, a
 * retrospective, a status lifecycle, or collaboration (they are not a commentable
 * subject). Imports {@link TenancyModule} for team-scoped data access + the
 * {@link TeamContextGuard}.
 */
@Module({
  imports: [TenancyModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
