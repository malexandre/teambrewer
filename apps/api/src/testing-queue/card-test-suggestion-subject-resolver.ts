import { Injectable, type OnModuleInit } from "@nestjs/common";

import {
  type AttachableSubjectResolver,
  type ResolvedSubject,
  SubjectResolverRegistry,
} from "../collaboration/subject-resolver.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { TeamContext } from "../tenancy/team-context.js";

/**
 * Makes a card-test suggestion an attachable collaboration subject
 * (`subjectType: "card_test_suggestion"`), mirroring the deck/event/game-log
 * adopters: it registers with the {@link SubjectResolverRegistry} on init so the
 * collaboration subsystem can resolve + authorize a suggestion without depending on
 * the testing-queue module.
 *
 * Filters by the verified `team.teamId` (never a client value), so a suggestion in
 * another team resolves to `null` → 404 (no enumeration). New comments are refused
 * on an archived suggestion. Suggestions have no private visibility (team-wide read),
 * so every resolvable suggestion is team-visible and its activity may appear.
 */
@Injectable()
export class CardTestSuggestionSubjectResolver implements AttachableSubjectResolver, OnModuleInit {
  readonly subjectType = "card_test_suggestion";

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SubjectResolverRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async resolve(team: TeamContext, subjectId: string): Promise<ResolvedSubject | null> {
    const suggestion = await this.prisma.cardTestSuggestion.findFirst({
      where: { id: subjectId, teamId: team.teamId },
      select: { archivedAt: true },
    });
    if (!suggestion) {
      return null;
    }
    return {
      canComment: suggestion.archivedAt === null,
      isTeamVisible: true,
    };
  }
}
