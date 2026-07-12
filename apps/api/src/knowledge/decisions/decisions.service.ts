import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";

import {
  type CreateDecisionInput,
  type Decision,
  type DecisionListQuery,
  type DecisionListResponse,
  errorCode,
  type RelatedSubjectRef,
  type UpdateDecisionInput,
} from "@teambrewer/shared";

import { CollaborationActivityService } from "../../collaboration/activity.service.js";
import { decodeKeysetCursor, encodeKeysetCursor } from "../../common/keyset-cursor.js";
import type { TeamContext } from "../../tenancy/team-context.js";
import { TeamScopedPrisma } from "../../tenancy/team-scoped-prisma.js";

/** A teammate's display identity, resolved for a decision's author. */
interface UserRow {
  id: string;
  username: string | null;
  displayName: string;
}

/** The persisted decision shape (with its author) this service maps to the contract. */
interface DecisionRow {
  id: string;
  authorId: string;
  title: string;
  context: string;
  decision: string;
  rationale: string;
  relatedSubjectType: string | null;
  relatedSubjectId: string | null;
  relatedSubjectSnapshotLabel: string | null;
  decidedAt: Date;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: UserRow;
}

const DECISION_INCLUDE = {
  author: { select: { id: true, username: true, displayName: true } },
} as const;

/**
 * Team-scoped decisions log (docs/features/team-knowledge.md) — a structured record of
 * what the team decided and why (context / decision / rationale). Every query goes
 * through {@link TeamScopedPrisma} so it is filtered by the verified `teamId`; a
 * cross-tenant id yields no row (→ 404). Any member records a decision; the author or a
 * team-admin corrects it (there is no delete — the log is append-oriented, so superseding
 * is a new decision that links back via `relatedSubjectRef`). A `relatedSubjectRef` is
 * validated to reference a same-team subject and captures a snapshot label at write time.
 */
@Injectable()
export class DecisionsService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly activity: CollaborationActivityService,
  ) {}

  /** List the team's decisions, reverse-chronological by `decidedAt`, keyset-paginated. */
  async list(query: DecisionListQuery): Promise<DecisionListResponse> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;

    const rows = (await this.scoped.db.decision.findMany({
      where: {
        archivedAt: null,
        ...(cursor
          ? {
              OR: [
                { decidedAt: { lt: cursor.sortValue } },
                { decidedAt: cursor.sortValue, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: DECISION_INCLUDE,
      orderBy: [{ decidedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as DecisionRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(toDecision),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.decidedAt, last.id) : null,
    };
  }

  /** Read a single non-archived decision (team-scoped), mapped to the contract, or 404. */
  async getDecision(decisionId: string): Promise<Decision> {
    return toDecision(await this.requireActiveDecisionRow(decisionId));
  }

  /**
   * Record a decision (any team member). Resolves + validates a `relatedSubjectRef` to a
   * same-team subject (→ 404 otherwise) and stores a snapshot label. Stamps
   * `teamId`/`authorId` from the verified context; `decidedAt` defaults to now.
   */
  async create(team: TeamContext, input: CreateDecisionInput): Promise<Decision> {
    const snapshotLabel = input.relatedSubjectRef
      ? await this.resolveRelatedSubjectLabel(input.relatedSubjectRef)
      : null;

    const created = await this.scoped.db.decision.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps teamId); never
        // from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        authorId: team.userId,
        title: input.title,
        context: input.context,
        decision: input.decision,
        rationale: input.rationale,
        relatedSubjectType: input.relatedSubjectRef?.subjectType ?? null,
        relatedSubjectId: input.relatedSubjectRef?.subjectId ?? null,
        relatedSubjectSnapshotLabel: snapshotLabel,
      },
      select: { id: true },
    });

    await this.recordActivity(team, created.id, "decision_recorded");
    return this.getDecision(created.id);
  }

  /**
   * Correct a decision in place (author or team-admin). A changed `relatedSubjectRef` is
   * re-validated and its snapshot label re-captured; `null` clears the reference.
   */
  async update(
    team: TeamContext,
    decisionId: string,
    input: UpdateDecisionInput,
  ): Promise<Decision> {
    const existing = await this.requireActiveDecisionRow(decisionId);
    if (existing.authorId !== team.userId && team.role !== "team_admin") {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "Only the author or a team-admin may edit this decision.",
        },
      });
    }

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data["title"] = input.title;
    if (input.context !== undefined) data["context"] = input.context;
    if (input.decision !== undefined) data["decision"] = input.decision;
    if (input.rationale !== undefined) data["rationale"] = input.rationale;
    if (input.relatedSubjectRef !== undefined) {
      if (input.relatedSubjectRef === null) {
        data["relatedSubjectType"] = null;
        data["relatedSubjectId"] = null;
        data["relatedSubjectSnapshotLabel"] = null;
      } else {
        data["relatedSubjectSnapshotLabel"] = await this.resolveRelatedSubjectLabel(
          input.relatedSubjectRef,
        );
        data["relatedSubjectType"] = input.relatedSubjectRef.subjectType;
        data["relatedSubjectId"] = input.relatedSubjectRef.subjectId;
      }
    }
    await this.scoped.db.decision.updateMany({ where: { id: decisionId }, data });

    await this.recordActivity(team, decisionId, "decision_updated");
    return this.getDecision(decisionId);
  }

  /** Record a decision lifecycle action on the team activity feed. */
  private async recordActivity(
    team: TeamContext,
    decisionId: string,
    verb: "decision_recorded" | "decision_updated",
  ): Promise<void> {
    await this.activity.recordActivity(team, {
      verb,
      subjectType: "decision",
      subjectId: decisionId,
    });
  }

  /** Read a non-archived decision (team-scoped), or throw 404. */
  private async requireActiveDecisionRow(decisionId: string): Promise<DecisionRow> {
    const row = (await this.scoped.db.decision.findFirst({
      where: { id: decisionId, archivedAt: null },
      include: DECISION_INCLUDE,
    })) as DecisionRow | null;
    if (!row) {
      throw decisionNotFound();
    }
    return row;
  }

  /**
   * Resolve a polymorphic related-subject reference to a human snapshot label, verifying
   * it belongs to the team. Each lookup goes through {@link TeamScopedPrisma}, so a
   * cross-team subject id yields no row → 404 (no enumeration). The captured label
   * survives later edits/deletion of the referenced subject.
   */
  private async resolveRelatedSubjectLabel(ref: RelatedSubjectRef): Promise<string> {
    const database = this.scoped.db;
    switch (ref.subjectType) {
      case "deck": {
        const row = await database.deck.findFirst({
          where: { id: ref.subjectId },
          select: { name: true },
        });
        return row?.name ?? this.throwRelatedSubjectNotFound();
      }
      case "event": {
        const row = await database.event.findFirst({
          where: { id: ref.subjectId },
          select: { name: true },
        });
        return row?.name ?? this.throwRelatedSubjectNotFound();
      }
      case "primer": {
        const row = await database.primer.findFirst({
          where: { id: ref.subjectId },
          select: { title: true },
        });
        return row?.title ?? this.throwRelatedSubjectNotFound();
      }
      case "decision": {
        const row = await database.decision.findFirst({
          where: { id: ref.subjectId },
          select: { title: true },
        });
        return row?.title ?? this.throwRelatedSubjectNotFound();
      }
      case "poll": {
        const row = await database.poll.findFirst({
          where: { id: ref.subjectId },
          select: { question: true },
        });
        return row?.question ?? this.throwRelatedSubjectNotFound();
      }
      case "matchup_game_plan": {
        const row = await database.matchupGamePlan.findFirst({
          where: { id: ref.subjectId },
          select: { opponentSnapshotLabel: true },
        });
        return row
          ? `Game-plan vs ${row.opponentSnapshotLabel}`
          : this.throwRelatedSubjectNotFound();
      }
      case "game_log": {
        const row = await database.gameLog.findFirst({
          where: { id: ref.subjectId },
          select: { id: true },
        });
        return row ? "Game log" : this.throwRelatedSubjectNotFound();
      }
      case "card_test_suggestion": {
        const row = await database.cardTestSuggestion.findFirst({
          where: { id: ref.subjectId },
          select: { id: true },
        });
        return row ? "Card-test suggestion" : this.throwRelatedSubjectNotFound();
      }
      case "test_assignment": {
        const row = await database.testAssignment.findFirst({
          where: { id: ref.subjectId },
          select: { opponentSnapshotLabel: true },
        });
        return row
          ? `Test assignment vs ${row.opponentSnapshotLabel}`
          : this.throwRelatedSubjectNotFound();
      }
      default:
        return this.throwRelatedSubjectNotFound();
    }
  }

  private throwRelatedSubjectNotFound(): never {
    throw new NotFoundException({
      error: {
        code: errorCode.notFound,
        message: "The related subject was not found in this team.",
      },
    });
  }
}

function decisionNotFound(): NotFoundException {
  return new NotFoundException({
    error: { code: errorCode.notFound, message: "Decision not found." },
  });
}

function toDecision(row: DecisionRow): Decision {
  return {
    id: row.id,
    authorId: row.authorId,
    author: {
      userId: row.author.id,
      username: row.author.username ?? "",
      displayName: row.author.displayName,
    },
    title: row.title,
    context: row.context,
    decision: row.decision,
    rationale: row.rationale,
    relatedSubjectRef:
      row.relatedSubjectType && row.relatedSubjectId
        ? {
            subjectType: row.relatedSubjectType as RelatedSubjectRef["subjectType"],
            subjectId: row.relatedSubjectId,
          }
        : null,
    relatedSubjectSnapshotLabel: row.relatedSubjectSnapshotLabel,
    decidedAt: row.decidedAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
