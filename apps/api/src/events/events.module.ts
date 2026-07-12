import { Module } from "@nestjs/common";

import { CollaborationModule } from "../collaboration/collaboration.module.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { DeckSelectionsController } from "./deck-selections.controller.js";
import { DeckSelectionsService } from "./deck-selections.service.js";
import { EventSubjectResolver } from "./event-subject-resolver.js";
import { EventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";
import { RetrospectivesController } from "./retrospectives.controller.js";
import { RetrospectivesService } from "./retrospectives.service.js";

/**
 * Events & gauntlets (phase-05, ADR-0004): the central organizing hub — team-scoped
 * tournaments with a gauntlet (the field to beat) and member attendance. Imports
 * {@link TenancyModule} for team-scoped data access + the {@link TeamContextGuard},
 * and {@link CollaborationModule} so events emit activity and register as a
 * commentable subject via {@link EventSubjectResolver}.
 *
 * Phase-09 adds two event sub-resources here (both nested under `/api/events/:eventId`,
 * sharing the `events` route prefix): per-member {@link DeckSelectionsController deck
 * selections} (with team-admin lock/unlock) and the post-event
 * {@link RetrospectivesController retrospective}.
 */
@Module({
  imports: [TenancyModule, CollaborationModule],
  controllers: [EventsController, DeckSelectionsController, RetrospectivesController],
  providers: [EventsService, EventSubjectResolver, DeckSelectionsService, RetrospectivesService],
  // Exported so the dashboard module (phase-11) can compose upcoming-events,
  // attendance, and deck-selection reads.
  exports: [EventsService, DeckSelectionsService],
})
export class EventsModule {}
