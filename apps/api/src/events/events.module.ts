import { Module } from "@nestjs/common";

import { CollaborationModule } from "../collaboration/collaboration.module.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { EventSubjectResolver } from "./event-subject-resolver.js";
import { EventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";

/**
 * Events & gauntlets (phase-05, ADR-0004): the central organizing hub — team-scoped
 * tournaments with a gauntlet (the field to beat) and member attendance. Imports
 * {@link TenancyModule} for team-scoped data access + the {@link TeamContextGuard},
 * and {@link CollaborationModule} so events emit activity and register as a
 * commentable subject via {@link EventSubjectResolver}.
 */
@Module({
  imports: [TenancyModule, CollaborationModule],
  controllers: [EventsController],
  providers: [EventsService, EventSubjectResolver],
})
export class EventsModule {}
