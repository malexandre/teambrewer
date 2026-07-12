import { NotFoundException } from "@nestjs/common";
import { errorCode } from "@teambrewer/shared";

import type { PrismaService } from "../prisma/prisma.service.js";

/**
 * Cross-game foreign-key guards for the global reference catalog (Format, Hero).
 * A team is bound to a single game, so any format/hero it references must belong
 * to that game. Shared by every module that accepts a client-supplied reference
 * id (decks, events, …) so the check can't drift or be forgotten.
 *
 * `db` may be a team-scoped client; Format and Hero are global models, so the
 * scoping proxy passes these queries through untouched.
 */
export async function assertFormatInGame(
  db: PrismaService,
  gameId: string,
  formatId: string,
): Promise<void> {
  const format = await db.format.findFirst({ where: { id: formatId, gameId } });
  if (!format) {
    throw new NotFoundException({
      error: { code: errorCode.notFound, message: "Format not found for this team's game." },
    });
  }
}

export async function assertHeroInGame(
  db: PrismaService,
  gameId: string,
  heroId: string,
): Promise<void> {
  const hero = await db.hero.findFirst({ where: { id: heroId, gameId, archivedAt: null } });
  if (!hero) {
    throw new NotFoundException({
      error: { code: errorCode.notFound, message: "Hero not found for this team's game." },
    });
  }
}
