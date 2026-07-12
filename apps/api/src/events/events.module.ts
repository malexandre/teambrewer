import { Module } from "@nestjs/common";

import { TenancyModule } from "../tenancy/tenancy.module.js";
import { EventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";

/**
 * Events & gauntlets (phase-05, ADR-0004): the central organizing hub — team-scoped
 * tournaments with a gauntlet (the field to beat) and member attendance. Imports
 * {@link TenancyModule} for team-scoped data access + the {@link TeamContextGuard}.
 * Collaboration attach (comments/activity on events) is deferred to a later phase.
 */
@Module({
  imports: [TenancyModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
