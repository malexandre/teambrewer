import { Module } from "@nestjs/common";

import { CollaborationModule } from "../collaboration/collaboration.module.js";
import { TenancyModule } from "../tenancy/tenancy.module.js";
import { MetasController } from "./metas.controller.js";
import { MetasService } from "./metas.service.js";

/**
 * Metas (meta-pivot redesign, WS-2, ADR-0010): the team's organizing hub — a
 * lightweight, team-scoped metagame window with a tiered opponent-deck list (the
 * reshaped gauntlet). Imports {@link TenancyModule} for team-scoped data access +
 * the {@link TeamContextGuard}, and {@link CollaborationModule} so metas emit
 * lifecycle activity. Metas are not (yet) a commentable subject, so no subject
 * resolver is registered.
 */
@Module({
  imports: [TenancyModule, CollaborationModule],
  controllers: [MetasController],
  providers: [MetasService],
  // Exported so later workstreams (e.g. decks meta-readiness) can compose the
  // meta + deck-entry reads.
  exports: [MetasService],
})
export class MetasModule {}
