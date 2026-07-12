import { Injectable, type OnModuleInit } from "@nestjs/common";

import {
  type AttachableSubjectResolver,
  type ResolvedSubject,
  SubjectResolverRegistry,
} from "../collaboration/subject-resolver.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Makes a game log an attachable collaboration subject (`subjectType: "game_log"`),
 * mirroring the deck/event adopters: it registers with the
 * {@link SubjectResolverRegistry} on init so the collaboration subsystem can resolve
 * + authorize a game log without depending on the game-logs module.
 *
 * Filters by the verified `team.teamId` (never a client value), so a log in another
 * team resolves to `null` → 404 (no enumeration). New comments are refused on an
 * archived log. Game logs have no private visibility (team-wide read), so every
 * resolvable log is team-visible and its activity may appear in the feed.
 */
@Injectable()
export class GameLogSubjectResolver implements AttachableSubjectResolver, OnModuleInit {
  readonly subjectType = "game_log";

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SubjectResolverRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async resolve(team: TeamContext, subjectId: string): Promise<ResolvedSubject | null> {
    const gameLog = await this.prisma.gameLog.findFirst({
      where: { id: subjectId, teamId: team.teamId },
      select: { archivedAt: true },
    });
    if (!gameLog) {
      return null;
    }
    return {
      canComment: gameLog.archivedAt === null,
      isTeamVisible: true,
    };
  }
}
