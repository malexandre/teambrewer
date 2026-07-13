import { Module } from "@nestjs/common";

import { CollaborationModule } from "../collaboration/collaboration.module.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { TaskSubjectResolver } from "./task-subject-resolver.js";
import { TasksController } from "./tasks.controller.js";
import { TasksService } from "./tasks.service.js";

/**
 * Tasks (meta-pivot redesign, WS-3, ADR-0010): the single free-form unit of testing
 * work that merges the old card-test suggestions + test assignments into one `Task`
 * (title + `+card`-enabled description, an optional deck link, upvotes, an assignee,
 * and a guarded status lifecycle whose `finished` state demands a report). Imports
 * {@link TenancyModule} for team-scoped data access + the {@link TeamContextGuard},
 * and {@link CollaborationModule} so a task emits lifecycle activity and registers
 * as a commentable subject via its subject resolver.
 */
@Module({
  imports: [TenancyModule, CollaborationModule],
  controllers: [TasksController],
  providers: [TasksService, TaskSubjectResolver],
  exports: [TasksService],
})
export class TasksModule {}
