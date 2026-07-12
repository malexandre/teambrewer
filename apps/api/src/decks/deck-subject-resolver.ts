import { Injectable, type OnModuleInit } from "@nestjs/common";

import {
  type AttachableSubjectResolver,
  type ResolvedSubject,
  SubjectResolverRegistry,
} from "../collaboration/subject-resolver.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { isDeckVisibleTo } from "./deck-authorization.js";

/**
 * Makes a deck an attachable collaboration subject (`subjectType: "deck"`). This
 * is the first adopter of the phase-04 attach pattern: it registers itself with
 * the {@link SubjectResolverRegistry} on init so the collaboration subsystem can
 * resolve + authorize a deck without depending on the decks module.
 *
 * A singleton that takes the verified {@link TeamContext} per call and filters by
 * `team.teamId` explicitly (never a client value). A deck in another team, or a
 * private draft the caller cannot see, resolves to `null` → 404 (no enumeration).
 * New comments are refused on an archived deck; a private deck's activity is not
 * team-visible so the feed cannot leak the draft's existence.
 */
@Injectable()
export class DeckSubjectResolver implements AttachableSubjectResolver, OnModuleInit {
  readonly subjectType = "deck";

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SubjectResolverRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async resolve(team: TeamContext, subjectId: string): Promise<ResolvedSubject | null> {
    const deck = await this.prisma.deck.findFirst({
      where: { id: subjectId, teamId: team.teamId },
      select: { ownerId: true, visibility: true, archivedAt: true },
    });
    if (!deck || !isDeckVisibleTo(team, deck)) {
      return null;
    }
    return {
      canComment: deck.archivedAt === null,
      isTeamVisible: deck.visibility === "team",
    };
  }
}
