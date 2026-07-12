import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import {
  createGameLogSchema,
  type GameLogDetail,
  type GameLogListResponse,
  gameLogListQuerySchema,
  updateGameLogSchema,
} from "@teambrewer/shared";

import { CurrentTeam } from "../tenancy/current-team.decorator.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamContextGuard } from "../tenancy/team-context.guard.js";
import { GameLogsService } from "./game-logs.service.js";

/**
 * Team-scoped game-logging endpoints (docs/features/game-logging.md). Every route
 * is guarded by {@link TeamContextGuard}; the verified team comes from
 * `@CurrentTeam()`, never the body. Request bodies/queries are validated at the
 * boundary with the shared Zod schemas. `confidenceWeight` is derived server-side
 * and appears only in responses (it is not an input field). Edits/archives are
 * limited to the logger or a team-admin (enforced in the service).
 */
@Controller("game-logs")
@UseGuards(TeamContextGuard)
export class GameLogsController {
  constructor(private readonly gameLogs: GameLogsService) {}

  @Get()
  list(@Query() query: unknown): Promise<GameLogListResponse> {
    return this.gameLogs.list(gameLogListQuerySchema.parse(query));
  }

  @Post()
  create(@CurrentTeam() team: TeamContext, @Body() body: unknown): Promise<GameLogDetail> {
    return this.gameLogs.create(team, createGameLogSchema.parse(body));
  }

  @Get(":gameLogId")
  getGameLog(@Param("gameLogId") gameLogId: string): Promise<GameLogDetail> {
    return this.gameLogs.getGameLog(gameLogId);
  }

  @Patch(":gameLogId")
  update(
    @CurrentTeam() team: TeamContext,
    @Param("gameLogId") gameLogId: string,
    @Body() body: unknown,
  ): Promise<GameLogDetail> {
    return this.gameLogs.update(team, gameLogId, updateGameLogSchema.parse(body));
  }

  @Delete(":gameLogId")
  @HttpCode(204)
  archive(@CurrentTeam() team: TeamContext, @Param("gameLogId") gameLogId: string): Promise<void> {
    return this.gameLogs.archive(team, gameLogId);
  }
}
