import { Injectable, type OnModuleInit } from "@nestjs/common";

import {
  type AttachableSubjectResolver,
  type ResolvedSubject,
  SubjectResolverRegistry,
} from "../../collaboration/subject-resolver.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { TeamContext } from "../../tenancy/team-context.js";
import { isPrimerVisibleTo } from "./primer-authorization.js";

/**
 * Makes a primer an attachable collaboration subject (`subjectType: "primer"`). Mirrors
 * the deck adopter: registers with the {@link SubjectResolverRegistry} on init so the
 * collaboration subsystem can resolve + authorize a primer without depending on the
 * primers module.
 *
 * Filters by the verified `team.teamId` (never a client value); a primer in another
 * team, or a private draft the caller cannot see, resolves to `null` → 404 (no
 * enumeration). New comments are refused on an archived primer; a private primer's
 * activity is not team-visible so the feed cannot leak the draft's existence.
 */
@Injectable()
export class PrimerSubjectResolver implements AttachableSubjectResolver, OnModuleInit {
  readonly subjectType = "primer";

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SubjectResolverRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async resolve(team: TeamContext, subjectId: string): Promise<ResolvedSubject | null> {
    const primer = await this.prisma.primer.findFirst({
      where: { id: subjectId, teamId: team.teamId },
      select: { authorId: true, visibility: true, archivedAt: true },
    });
    if (!primer || !isPrimerVisibleTo(team, primer)) {
      return null;
    }
    return {
      canComment: primer.archivedAt === null,
      isTeamVisible: primer.visibility === "team",
    };
  }
}
