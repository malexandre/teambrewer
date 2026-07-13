import { Injectable, type OnModuleInit } from "@nestjs/common";

import {
  type AttachableSubjectResolver,
  type ResolvedSubject,
  SubjectResolverRegistry,
} from "../collaboration/subject-resolver.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Makes a task an attachable collaboration subject (`subjectType: "task"`),
 * mirroring the deck/game-log/game-plan adopters: it registers with the {@link
 * SubjectResolverRegistry} on init so the collaboration subsystem can resolve +
 * authorize a task without depending on the tasks module.
 *
 * Filters by the verified `team.teamId` (never a client value), so a task in
 * another team resolves to `null` → 404 (no enumeration). New comments are refused
 * on an archived task. Tasks have no private visibility (team-wide read), so every
 * resolvable task is team-visible and its activity may appear in the feed.
 */
@Injectable()
export class TaskSubjectResolver implements AttachableSubjectResolver, OnModuleInit {
  readonly subjectType = "task";

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SubjectResolverRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async resolve(team: TeamContext, subjectId: string): Promise<ResolvedSubject | null> {
    const task = await this.prisma.task.findFirst({
      where: { id: subjectId, teamId: team.teamId },
      select: { archivedAt: true },
    });
    if (!task) {
      return null;
    }
    return {
      canComment: task.archivedAt === null,
      isTeamVisible: true,
    };
  }
}
