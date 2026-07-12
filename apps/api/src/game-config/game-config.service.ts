import { Injectable, NotFoundException } from "@nestjs/common";
import { type GameConfig, errorCode } from "@teambrewer/shared";

import { GameAdapterRegistry } from "../games/game-adapter.registry.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Resolves per-game UI config for the verified team by looking up its game's key
 * and asking the GameAdapter. Read-only; the only non-sync consumer of the adapter
 * registry (a game-agnostic seam — see docs/architecture/game-abstraction.md).
 */
@Injectable()
export class GameConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: GameAdapterRegistry,
  ) {}

  async getForTeam(team: TeamContext): Promise<GameConfig> {
    const game = await this.prisma.game.findFirst({
      where: { id: team.gameId },
      select: { id: true, key: true },
    });
    if (!game) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Game not found for this team." },
      });
    }
    const adapter = this.registry.get(game.key);
    return {
      gameId: game.id,
      identityLabel: adapter.identityLabel,
      defaultBestOf: adapter.defaultBestOf,
    };
  }
}
