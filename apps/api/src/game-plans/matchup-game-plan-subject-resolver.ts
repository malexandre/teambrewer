import { Injectable, type OnModuleInit } from "@nestjs/common";

import {
  type AttachableSubjectResolver,
  type ResolvedSubject,
  SubjectResolverRegistry,
} from "../collaboration/subject-resolver.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Makes a matchup game-plan an attachable collaboration subject
 * (`subjectType: "matchup_game_plan"`), mirroring the deck/event/game-log adopters:
 * it registers with the {@link SubjectResolverRegistry} on init so the collaboration
 * subsystem can resolve + authorize a plan without depending on the game-plans module.
 *
 * Filters by the verified `team.teamId` (never a client value), so a plan in another
 * team resolves to `null` → 404 (no enumeration). New comments are refused on an
 * archived plan. Game-plans have no private visibility (team-wide read), so every
 * resolvable plan is team-visible and its activity may appear.
 */
@Injectable()
export class MatchupGamePlanSubjectResolver implements AttachableSubjectResolver, OnModuleInit {
  readonly subjectType = "matchup_game_plan";

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SubjectResolverRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async resolve(team: TeamContext, subjectId: string): Promise<ResolvedSubject | null> {
    const plan = await this.prisma.matchupGamePlan.findFirst({
      where: { id: subjectId, teamId: team.teamId },
      select: { archivedAt: true },
    });
    if (!plan) {
      return null;
    }
    return {
      canComment: plan.archivedAt === null,
      isTeamVisible: true,
    };
  }
}
