import { Injectable, type OnModuleInit } from "@nestjs/common";

import {
  type AttachableSubjectResolver,
  type ResolvedSubject,
  SubjectResolverRegistry,
} from "../../collaboration/subject-resolver.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { TeamContext } from "../../tenancy/team-context.js";

/**
 * Makes a decision an attachable collaboration subject (`subjectType: "decision"`).
 * Registers with the {@link SubjectResolverRegistry} on init so the collaboration
 * subsystem can resolve + authorize a decision without depending on the decisions module.
 *
 * Filters by the verified `team.teamId` (never a client value); a decision in another
 * team resolves to `null` → 404 (no enumeration). Decisions are always team-visible (no
 * private state); new comments are refused on an archived decision.
 */
@Injectable()
export class DecisionSubjectResolver implements AttachableSubjectResolver, OnModuleInit {
  readonly subjectType = "decision";

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SubjectResolverRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async resolve(team: TeamContext, subjectId: string): Promise<ResolvedSubject | null> {
    const decision = await this.prisma.decision.findFirst({
      where: { id: subjectId, teamId: team.teamId },
      select: { archivedAt: true },
    });
    if (!decision) {
      return null;
    }
    return {
      canComment: decision.archivedAt === null,
      isTeamVisible: true,
    };
  }
}
