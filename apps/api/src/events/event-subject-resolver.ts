import { Injectable, type OnModuleInit } from "@nestjs/common";

import {
  type AttachableSubjectResolver,
  type ResolvedSubject,
  SubjectResolverRegistry,
} from "../collaboration/subject-resolver.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Makes an event an attachable collaboration subject (`subjectType: "event"`),
 * mirroring the deck adopter: it registers itself with the
 * {@link SubjectResolverRegistry} on init so the collaboration subsystem can
 * resolve + authorize an event without depending on the events module.
 *
 * Filters by the verified `team.teamId` (never a client value), so an event in
 * another team resolves to `null` → 404 (no enumeration). New comments are refused
 * on an archived event. Events have no private visibility (a shared team board), so
 * every resolvable event is team-visible and its activity may appear in the feed.
 */
@Injectable()
export class EventSubjectResolver implements AttachableSubjectResolver, OnModuleInit {
  readonly subjectType = "event";

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SubjectResolverRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async resolve(team: TeamContext, subjectId: string): Promise<ResolvedSubject | null> {
    const event = await this.prisma.event.findFirst({
      where: { id: subjectId, teamId: team.teamId },
      select: { archivedAt: true },
    });
    if (!event) {
      return null;
    }
    return {
      canComment: event.archivedAt === null,
      isTeamVisible: true,
    };
  }
}
