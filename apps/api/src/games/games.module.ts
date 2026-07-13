import { Module } from "@nestjs/common";

import { RoleGuard } from "../common/role.guard.js";
import { FabCardSourceClient } from "./flesh-and-blood/fab-card-source.client.js";
import { FleshAndBloodAdapter } from "./flesh-and-blood/flesh-and-blood.adapter.js";
import type { GameAdapter } from "./game-adapter.interface.js";
import { GAME_ADAPTERS, GameAdapterRegistry } from "./game-adapter.registry.js";
import { GamesController } from "./games.controller.js";
import { RiftboundAdapter } from "./riftbound/riftbound.adapter.js";
import { RiftcodexCardSourceClient } from "./riftbound/riftcodex-card-source.client.js";

/**
 * Wires the game adapters and the registry that resolves them by game key. This
 * is the only module that knows the concrete adapters exist; the rest of the API
 * depends on {@link GameAdapterRegistry}. Adding a game (phase-12) means adding
 * its adapter to the `GAME_ADAPTERS` factory here — no core changes. It also
 * exposes the global supported-games catalog via {@link GamesController} (which
 * reads the static `GAME_CATALOG`, independent of the adapter wiring).
 */
@Module({
  controllers: [GamesController],
  providers: [
    FabCardSourceClient,
    FleshAndBloodAdapter,
    RiftcodexCardSourceClient,
    RiftboundAdapter,
    {
      provide: GAME_ADAPTERS,
      useFactory: (
        fleshAndBlood: FleshAndBloodAdapter,
        riftbound: RiftboundAdapter,
      ): GameAdapter[] => [fleshAndBlood, riftbound],
      inject: [FleshAndBloodAdapter, RiftboundAdapter],
    },
    GameAdapterRegistry,
    RoleGuard,
  ],
  exports: [GameAdapterRegistry, FleshAndBloodAdapter, RiftboundAdapter],
})
export class GamesModule {}
