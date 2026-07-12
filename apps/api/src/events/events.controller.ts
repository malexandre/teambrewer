import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  type Attendance,
  type EventDetail,
  type EventListResponse,
  createEventSchema,
  createGauntletEntrySchema,
  eventListQuerySchema,
  type GauntletEntry,
  type GauntletEntryList,
  setAttendanceSchema,
  updateEventSchema,
  updateGauntletEntrySchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { EventsService } from "./events.service.js";

/**
 * Team-scoped event, gauntlet, and attendance endpoints
 * (docs/features/events-and-gauntlets.md). Every route is guarded by
 * {@link TeamContextGuard}; the verified team comes from `@CurrentTeam()`, never
 * the body. Request bodies/queries are validated at the boundary with the shared
 * Zod schemas. An event advances its status through the general `PATCH` (no
 * dedicated status route); attendance is set per-user via `PUT .../attendance/me`.
 */
@Controller("events")
@UseGuards(TeamContextGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(@Query() query: unknown): Promise<EventListResponse> {
    return this.events.list(eventListQuerySchema.parse(query));
  }

  @Post()
  create(@CurrentTeam() team: TeamContext, @Body() body: unknown): Promise<EventDetail> {
    return this.events.create(team, createEventSchema.parse(body));
  }

  @Get(":eventId")
  getEvent(@Param("eventId") eventId: string): Promise<EventDetail> {
    return this.events.getEvent(eventId);
  }

  @Patch(":eventId")
  update(
    @CurrentTeam() team: TeamContext,
    @Param("eventId") eventId: string,
    @Body() body: unknown,
  ): Promise<EventDetail> {
    return this.events.update(team, eventId, updateEventSchema.parse(body));
  }

  @Delete(":eventId")
  @HttpCode(204)
  archive(@Param("eventId") eventId: string): Promise<void> {
    return this.events.archive(eventId);
  }

  @Get(":eventId/gauntlet-entries")
  listGauntletEntries(@Param("eventId") eventId: string): Promise<GauntletEntryList> {
    return this.events.listGauntletEntries(eventId);
  }

  @Post(":eventId/gauntlet-entries")
  addGauntletEntry(
    @CurrentTeam() team: TeamContext,
    @Param("eventId") eventId: string,
    @Body() body: unknown,
  ): Promise<GauntletEntry> {
    return this.events.addGauntletEntry(team, eventId, createGauntletEntrySchema.parse(body));
  }

  @Patch(":eventId/gauntlet-entries/:gauntletEntryId")
  updateGauntletEntry(
    @Param("eventId") eventId: string,
    @Param("gauntletEntryId") gauntletEntryId: string,
    @Body() body: unknown,
  ): Promise<GauntletEntry> {
    return this.events.updateGauntletEntry(
      eventId,
      gauntletEntryId,
      updateGauntletEntrySchema.parse(body),
    );
  }

  @Delete(":eventId/gauntlet-entries/:gauntletEntryId")
  @HttpCode(204)
  removeGauntletEntry(
    @Param("eventId") eventId: string,
    @Param("gauntletEntryId") gauntletEntryId: string,
  ): Promise<void> {
    return this.events.removeGauntletEntry(eventId, gauntletEntryId);
  }

  @Get(":eventId/attendance")
  listAttendance(@Param("eventId") eventId: string): Promise<{ data: Attendance[] }> {
    return this.events.listAttendance(eventId);
  }

  @Put(":eventId/attendance/me")
  setMyAttendance(
    @CurrentTeam() team: TeamContext,
    @Param("eventId") eventId: string,
    @Body() body: unknown,
  ): Promise<Attendance> {
    return this.events.setMyAttendance(team, eventId, setAttendanceSchema.parse(body));
  }
}
