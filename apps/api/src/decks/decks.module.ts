import { Module } from "@nestjs/common";

import { CollaborationModule } from "../collaboration/collaboration.module.js";
import { GamesModule } from "../games/games.module.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { DeckSubjectResolver } from "./deck-subject-resolver.js";
import { DecksController } from "./decks.controller.js";
import { DecksService } from "./decks.service.js";

/**
 * Decks: the first team-owned domain feature (phase-03, ADR-0002 decks-as-links)
 * and the first adopter of the phase-04 collaboration attach pattern. Imports
 * {@link TenancyModule} for the team-scoped data access + guard,
 * {@link GamesModule} for best-effort deck-URL recognition, and
 * {@link CollaborationModule} so decks emit activity and register as a
 * commentable subject via {@link DeckSubjectResolver}.
 */
@Module({
  imports: [TenancyModule, GamesModule, CollaborationModule],
  controllers: [DecksController],
  providers: [DecksService, DeckSubjectResolver],
})
export class DecksModule {}
