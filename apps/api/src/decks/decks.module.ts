import { Module } from "@nestjs/common";

import { GamesModule } from "../games/games.module.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { DecksController } from "./decks.controller.js";
import { DecksService } from "./decks.service.js";

/**
 * Decks: the first team-owned domain feature (phase-03, ADR-0002 decks-as-links).
 * Imports {@link TenancyModule} for the team-scoped data access + guard, and
 * {@link GamesModule} for best-effort deck-URL recognition via the game adapter.
 */
@Module({
  imports: [TenancyModule, GamesModule],
  controllers: [DecksController],
  providers: [DecksService],
})
export class DecksModule {}
