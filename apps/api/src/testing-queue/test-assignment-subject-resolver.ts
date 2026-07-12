import { Injectable, type OnModuleInit } from "@nestjs/common";

import {
  type AttachableSubjectResolver,
  type ResolvedSubject,
  SubjectResolverRegistry,
} from "../collaboration/subject-resolver.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Makes a test assignment an attachable collaboration subject
 * (`subjectType: "test_assignment"`), mirroring the deck/event/game-log/suggestion
 * adopters: it registers with the {@link SubjectResolverRegistry} on init so the
 * collaboration subsystem can resolve + authorize an assignment without depending on
 * the testing-queue module.
 *
 * Filters by the verified `team.teamId` (never a client value), so an assignment in
 * another team resolves to `null` → 404 (no enumeration). New comments are refused on
 * an archived assignment. Assignments have no private visibility (team-wide read), so
 * every resolvable assignment is team-visible and its activity may appear.
 */
@Injectable()
export class TestAssignmentSubjectResolver implements AttachableSubjectResolver, OnModuleInit {
  readonly subjectType = "test_assignment";

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SubjectResolverRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async resolve(team: TeamContext, subjectId: string): Promise<ResolvedSubject | null> {
    const assignment = await this.prisma.testAssignment.findFirst({
      where: { id: subjectId, teamId: team.teamId },
      select: { archivedAt: true },
    });
    if (!assignment) {
      return null;
    }
    return {
      canComment: assignment.archivedAt === null,
      isTeamVisible: true,
    };
  }
}
