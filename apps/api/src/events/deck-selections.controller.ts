import { Body, Controller, Get, Param, Patch, Put, UseGuards } from "@nestjs/common";

import {
  type DeckSelection,
  type DeckSelectionList,
  setDeckSelectionSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { DeckSelectionsService } from "./deck-selections.service.js";

/**
 * Team-scoped per-event deck-selection endpoints, nested under the event
 * (docs/features/gameplans-and-deck-selection.md). Guarded by {@link TeamContextGuard};
 * the verified team + caller come from `@CurrentTeam()`, never the body. A member
 * upserts their own pick via `PUT .../me`; lock/unlock is team-admin only.
 */
@Controller("events")
@UseGuards(TeamContextGuard)
export class DeckSelectionsController {
  constructor(private readonly deckSelections: DeckSelectionsService) {}

  @Get(":eventId/deck-selections")
  list(@Param("eventId") eventId: string): Promise<DeckSelectionList> {
    return this.deckSelections.listForEvent(eventId);
  }

  @Put(":eventId/deck-selections/me")
  setMine(
    @CurrentTeam() team: TeamContext,
    @Param("eventId") eventId: string,
    @Body() body: unknown,
  ): Promise<DeckSelection> {
    return this.deckSelections.setMine(team, eventId, setDeckSelectionSchema.parse(body));
  }

  @Patch(":eventId/deck-selections/:selectionId/lock")
  lock(
    @CurrentTeam() team: TeamContext,
    @Param("eventId") eventId: string,
    @Param("selectionId") selectionId: string,
  ): Promise<DeckSelection> {
    return this.deckSelections.lock(team, eventId, selectionId);
  }

  @Patch(":eventId/deck-selections/:selectionId/unlock")
  unlock(
    @CurrentTeam() team: TeamContext,
    @Param("eventId") eventId: string,
    @Param("selectionId") selectionId: string,
  ): Promise<DeckSelection> {
    return this.deckSelections.unlock(team, eventId, selectionId);
  }
}
