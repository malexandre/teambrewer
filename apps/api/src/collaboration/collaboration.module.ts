import { Module } from "@nestjs/common";

import { TenancyModule } from "../tenancy/tenancy.module.js";
import { ActivityController } from "./activity.controller.js";
import { CollaborationActivityService } from "./activity.service.js";
import { CollaborationService } from "./collaboration.service.js";
import { CommentsController } from "./comments.controller.js";
import { NotificationService } from "./notification.service.js";
import { NotificationsController } from "./notifications.controller.js";
import { SubjectResolverRegistry } from "./subject-resolver.js";

/**
 * Collaboration core (phase-04): the shared, polymorphic comment / mention /
 * notification / activity subsystem (docs/features/collaboration-core.md). It
 * never depends on the modules it serves — owning modules import this module and
 * register an {@link SubjectResolverRegistry} resolver for their `subjectType`.
 * The registry and the activity service are exported so those modules can register
 * and record activity. Imports {@link TenancyModule} for the team-scoped data
 * access + guard.
 */
@Module({
  imports: [TenancyModule],
  controllers: [CommentsController, NotificationsController, ActivityController],
  providers: [
    SubjectResolverRegistry,
    CollaborationService,
    CollaborationActivityService,
    NotificationService,
  ],
  exports: [SubjectResolverRegistry, CollaborationActivityService],
})
export class CollaborationModule {}
