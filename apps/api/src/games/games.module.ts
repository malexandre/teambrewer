import { Module } from "@nestjs/common";

import { FabCardSourceClient } from "./flesh-and-blood/fab-card-source.client.js";
import { FleshAndBloodAdapter } from "./flesh-and-blood/flesh-and-blood.adapter.js";
import type { GameAdapter } from "./game-adapter.interface.js";
import { GAME_ADAPTERS, GameAdapterRegistry } from "./game-adapter.registry.js";

/**
 * Wires the game adapters and the registry that resolves them by game key. This
 * is the only module that knows the concrete adapters exist; the rest of the API
 * depends on {@link GameAdapterRegistry}. Adding a game (phase-12) means adding
 * its adapter to the `GAME_ADAPTERS` factory here — no core changes.
 */
@Module({
  providers: [
    FabCardSourceClient,
    FleshAndBloodAdapter,
    {
      provide: GAME_ADAPTERS,
      useFactory: (fleshAndBlood: FleshAndBloodAdapter): GameAdapter[] => [fleshAndBlood],
      inject: [FleshAndBloodAdapter],
    },
    GameAdapterRegistry,
  ],
  exports: [GameAdapterRegistry, FleshAndBloodAdapter],
})
export class GamesModule {}
