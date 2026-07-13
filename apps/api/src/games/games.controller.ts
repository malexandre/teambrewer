import { Controller, Get, UseGuards } from "@nestjs/common";
import type { GameSummaryList } from "@teambrewer/shared";

import { RoleGuard } from "../common/role.guard.js";
import { GAME_CATALOG } from "./game-catalog.js";

/**
 * The global catalog of supported games (`GET /api/games`). This is the
 * instance-wide supported-games list — NOT team-scoped — so it is gated only to
 * authenticated callers via {@link RoleGuard} (no role decorator = any session),
 * the same "authenticated but unprivileged" pattern used by `/me`. It drives the
 * admin team-create Game select.
 */
@Controller("games")
@UseGuards(RoleGuard)
export class GamesController {
  @Get()
  list(): GameSummaryList {
    return {
      data: GAME_CATALOG.map((game) => ({ id: game.id, key: game.key, name: game.name })),
    };
  }
}
