import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  type CreatePrimerInput,
  errorCode,
  type PrimerDetail,
  type PrimerListQuery,
  type PrimerListResponse,
  type PrimerSummary,
  type UpdatePrimerInput,
} from "@teambrewer/shared";

import { CollaborationActivityService } from "../../collaboration/activity.service.js";
import { decodeKeysetCursor, encodeKeysetCursor } from "../../common/keyset-cursor.js";
import type { TeamContext } from "../../tenancy/team-context.js";
import { TeamScopedPrisma } from "../../tenancy/team-scoped-prisma.js";
import { canArchivePrimer, isPrimerVisibleTo } from "./primer-authorization.js";

/** A teammate's display identity, resolved for a primer's author. */
interface UserRow {
  id: string;
  username: string | null;
  displayName: string;
}

/** The persisted primer shape (with relations) this service maps to the contract. */
interface PrimerRow {
  id: string;
  authorId: string;
  title: string;
  kind: PrimerSummary["kind"];
  relatedDeckId: string | null;
  body: string;
  visibility: PrimerSummary["visibility"];
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: UserRow;
  relatedDeck: { name: string } | null;
}

const PRIMER_INCLUDE = {
  author: { select: { id: true, username: true, displayName: true } },
  relatedDeck: { select: { name: true } },
} as const;

/**
 * Team-scoped primers (docs/features/team-knowledge.md) — long-form living documents
 * (deck/matchup/format writeups). Every query goes through {@link TeamScopedPrisma} so
 * it is filtered by the verified `teamId`; a cross-tenant id yields no row (→ 404, never
 * leaking existence). Any member may create or edit a primer they can see; a `private`
 * primer is visible/editable only by its author (and team-admins for moderation); the
 * author or a team-admin may archive. Bodies are markdown source, rendered as
 * pre-wrapped plain text in the UI.
 */
@Injectable()
export class PrimersService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly activity: CollaborationActivityService,
  ) {}

  /**
   * List the team's primers (newest first, keyset-paginated) with `kind`/`relatedDeckId`
   * filters. Archived primers and other members' private drafts are excluded.
   */
  async list(team: TeamContext, query: PrimerListQuery): Promise<PrimerListResponse> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;

    const andClauses: Record<string, unknown>[] = [];
    if (query.kind) andClauses.push({ kind: query.kind });
    if (query.relatedDeckId) andClauses.push({ relatedDeckId: query.relatedDeckId });
    // Non-admins never see another member's private draft (admins moderate all).
    if (team.role !== "team_admin") {
      andClauses.push({ OR: [{ visibility: "team" }, { authorId: team.userId }] });
    }
    if (cursor) {
      andClauses.push({
        OR: [
          { createdAt: { lt: cursor.sortValue } },
          { createdAt: cursor.sortValue, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = (await this.scoped.db.primer.findMany({
      where: { archivedAt: null, ...(andClauses.length > 0 ? { AND: andClauses } : {}) },
      include: PRIMER_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as PrimerRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(toPrimerSummary),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.createdAt, last.id) : null,
    };
  }

  /** Read a single visible, non-archived primer, mapped to the contract, or 404. */
  async getPrimer(team: TeamContext, primerId: string): Promise<PrimerDetail> {
    return toPrimerDetail(await this.requireVisiblePrimer(team, primerId));
  }

  /**
   * Create a primer. Validates `relatedDeckId` (when set) belongs to the team. Stamps
   * `teamId`/`authorId` from the verified context. Records `primer_created` activity
   * unless the primer is a private draft (so the feed cannot leak the draft).
   */
  async create(team: TeamContext, input: CreatePrimerInput): Promise<PrimerDetail> {
    if (input.relatedDeckId !== undefined) {
      await this.assertTeamDeck(input.relatedDeckId);
    }

    const created = await this.scoped.db.primer.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps teamId); never
        // from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        authorId: team.userId,
        title: input.title,
        kind: input.kind,
        relatedDeckId: input.relatedDeckId ?? null,
        body: input.body,
        visibility: input.visibility,
      },
      select: { id: true },
    });

    await this.recordActivity(team, created.id, input.visibility, "primer_created");
    return this.getPrimer(team, created.id);
  }

  /**
   * Edit a primer in place (any member who can see it). Validates a changed
   * `relatedDeckId` belongs to the team. Records `primer_updated` activity unless the
   * resulting primer is private.
   */
  async update(
    team: TeamContext,
    primerId: string,
    input: UpdatePrimerInput,
  ): Promise<PrimerDetail> {
    const existing = await this.requireVisiblePrimer(team, primerId);

    if (input.relatedDeckId !== undefined && input.relatedDeckId !== null) {
      await this.assertTeamDeck(input.relatedDeckId);
    }

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data["title"] = input.title;
    if (input.kind !== undefined) data["kind"] = input.kind;
    if (input.relatedDeckId !== undefined) data["relatedDeckId"] = input.relatedDeckId;
    if (input.body !== undefined) data["body"] = input.body;
    if (input.visibility !== undefined) data["visibility"] = input.visibility;
    await this.scoped.db.primer.updateMany({ where: { id: primerId }, data });

    const resultingVisibility = input.visibility ?? existing.visibility;
    await this.recordActivity(team, primerId, resultingVisibility, "primer_updated");
    return this.getPrimer(team, primerId);
  }

  /** Soft-delete (archive) a primer; author or team-admin only. Retained for history. */
  async archive(team: TeamContext, primerId: string): Promise<void> {
    const primer = await this.requireVisiblePrimer(team, primerId);
    if (!canArchivePrimer(team, primer)) {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "Only the author or a team-admin may archive this primer.",
        },
      });
    }
    await this.scoped.db.primer.updateMany({
      where: { id: primerId },
      data: { archivedAt: new Date() },
    });
  }

  /** Record a primer lifecycle action, unless the primer is a private draft. */
  private async recordActivity(
    team: TeamContext,
    primerId: string,
    visibility: string,
    verb: "primer_created" | "primer_updated",
  ): Promise<void> {
    if (visibility !== "team") {
      return;
    }
    await this.activity.recordActivity(team, { verb, subjectType: "primer", subjectId: primerId });
  }

  /** Read a visible, non-archived primer (team-scoped), or throw 404. */
  private async requireVisiblePrimer(team: TeamContext, primerId: string): Promise<PrimerRow> {
    const row = (await this.scoped.db.primer.findFirst({
      where: { id: primerId, archivedAt: null },
      include: PRIMER_INCLUDE,
    })) as PrimerRow | null;
    if (!row || !isPrimerVisibleTo(team, row)) {
      throw primerNotFound();
    }
    return row;
  }

  /** Reject a `relatedDeckId` that does not belong to the team (cross-team FK → 422). */
  private async assertTeamDeck(deckId: string): Promise<void> {
    const deck = await this.scoped.db.deck.findFirst({
      where: { id: deckId },
      select: { id: true },
    });
    if (!deck) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "The related deck does not belong to this team.",
        },
      });
    }
  }
}

function primerNotFound(): NotFoundException {
  return new NotFoundException({
    error: { code: errorCode.notFound, message: "Primer not found." },
  });
}

function toPrimerSummary(row: PrimerRow): PrimerSummary {
  return {
    id: row.id,
    authorId: row.authorId,
    author: {
      userId: row.author.id,
      username: row.author.username ?? "",
      displayName: row.author.displayName,
    },
    title: row.title,
    kind: row.kind,
    relatedDeckId: row.relatedDeckId,
    relatedDeckName: row.relatedDeck?.name ?? null,
    visibility: row.visibility,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPrimerDetail(row: PrimerRow): PrimerDetail {
  return { ...toPrimerSummary(row), body: row.body };
}
