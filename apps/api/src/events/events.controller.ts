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
  type AttendanceList,
  createEventSchema,
  type EventDetail,
  eventListQuerySchema,
  type EventListResponse,
  setAttendanceSchema,
  setTravelSchema,
  updateEventSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { EventsService } from "./events.service.js";

/**
 * Team-scoped event + attendance endpoints (docs/features/events-and-gauntlets.md).
 * Every route is guarded by {@link TeamContextGuard}; the verified team comes from
 * `@CurrentTeam()`, never the body. Request bodies/queries are validated at the
 * boundary with the shared Zod schemas. Attendance is set per-user via
 * `PUT .../attendance/me` (an idempotent upsert).
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
  update(@Param("eventId") eventId: string, @Body() body: unknown): Promise<EventDetail> {
    return this.events.update(eventId, updateEventSchema.parse(body));
  }

  @Delete(":eventId")
  @HttpCode(204)
  archive(@Param("eventId") eventId: string): Promise<void> {
    return this.events.archive(eventId);
  }

  @Get(":eventId/attendance")
  listAttendance(@Param("eventId") eventId: string): Promise<AttendanceList> {
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

  @Put(":eventId/attendance/me/travel")
  setMyTravel(
    @CurrentTeam() team: TeamContext,
    @Param("eventId") eventId: string,
    @Body() body: unknown,
  ): Promise<Attendance> {
    return this.events.setMyTravel(team, eventId, setTravelSchema.parse(body));
  }
}
