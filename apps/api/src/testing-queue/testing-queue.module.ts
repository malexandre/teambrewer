import { Module } from "@nestjs/common";

import { CollaborationModule } from "../collaboration/collaboration.module.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { CardTestSuggestionSubjectResolver } from "./card-test-suggestion-subject-resolver.js";
import { CardTestSuggestionsController } from "./card-test-suggestions.controller.js";
import { CardTestSuggestionsService } from "./card-test-suggestions.service.js";
import { TestAssignmentSubjectResolver } from "./test-assignment-subject-resolver.js";
import { TestAssignmentsController } from "./test-assignments.controller.js";
import { TestAssignmentsService } from "./test-assignments.service.js";

/**
 * Testing queue (phase-08): per-deck card-test suggestions (with upvotes) and test
 * assignments that hand a matchup to a member. Imports {@link TenancyModule} for
 * team-scoped data access + the {@link TeamContextGuard}, and {@link
 * CollaborationModule} so the entities emit activity and register as commentable
 * subjects via their subject resolvers.
 */
@Module({
  imports: [TenancyModule, CollaborationModule],
  controllers: [CardTestSuggestionsController, TestAssignmentsController],
  providers: [
    CardTestSuggestionsService,
    CardTestSuggestionSubjectResolver,
    TestAssignmentsService,
    TestAssignmentSubjectResolver,
  ],
})
export class TestingQueueModule {}
