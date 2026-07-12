import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  type CardTestSuggestion,
  type CardTestSuggestionListQuery,
  type CardTestSuggestionListResponse,
  type CardTestSuggestionStatus,
  type CreateCardTestSuggestionInput,
  errorCode,
  type UpdateCardTestSuggestionInput,
} from "@teambrewer/shared";

import { CollaborationActivityService } from "../collaboration/activity.service.js";
import { decodeKeysetCursor, encodeKeysetCursor } from "../common/keyset-cursor.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";
import { canModifySuggestion } from "./suggestion-authorization.js";
import {
  assertResolutionNotePresent,
  assertSuggestionStatusTransition,
} from "./suggestion-status-transition.js";

/** A minimal card-summary shape (name + pitch + image) resolved for the board. */
interface CardRow {
  id: string;
  name: string;
  pitch: number | null;
  imageUrl: string | null;
}

/** The persisted suggestion shape (with its relations) this service maps to the contract. */
interface SuggestionRow {
  id: string;
  teamId: string;
  deckId: string;
  authorId: string;
  cardInId: string;
  cardOutId: string | null;
  reasoning: string;
  status: CardTestSuggestionStatus;
  resolutionNote: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; username: string | null; displayName: string };
  cardIn: CardRow;
  cardOut: CardRow | null;
  votes: { userId: string }[];
}

const SUGGESTION_INCLUDE = {
  author: { select: { id: true, username: true, displayName: true } },
  cardIn: { select: { id: true, name: true, pitch: true, imageUrl: true } },
  cardOut: { select: { id: true, name: true, pitch: true, imageUrl: true } },
  votes: { select: { userId: true } },
} as const;

/**
 * Team-scoped card-test suggestions (docs/features/testing-queue.md §Card-test
 * suggestions). Every query goes through {@link TeamScopedPrisma} so it is filtered
 * by the verified `teamId`; a cross-tenant id yields no row (→ 404, never leaking
 * existence). Any member may create + upvote; only the author or a team-admin may
 * edit / transition / archive. Adopting mutates no deck (decks are links, ADR-0002);
 * it records a durable conclusion in the resolution note.
 */
@Injectable()
export class CardTestSuggestionsService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly activity: CollaborationActivityService,
  ) {}

  /**
   * List the team's suggestions with `deckId`/`status` filters + keyset pagination
   * (newest first). Archived suggestions are excluded. Each row carries its vote
   * tally and whether the requesting member has upvoted.
   */
  async list(
    team: TeamContext,
    query: CardTestSuggestionListQuery,
  ): Promise<CardTestSuggestionListResponse> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;

    const andClauses: Record<string, unknown>[] = [];
    if (query.deckId) andClauses.push({ deckId: query.deckId });
    if (query.status) andClauses.push({ status: query.status });
    if (cursor) {
      andClauses.push({
        OR: [
          { createdAt: { lt: cursor.sortValue } },
          { createdAt: cursor.sortValue, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = (await this.scoped.db.cardTestSuggestion.findMany({
      where: { archivedAt: null, ...(andClauses.length > 0 ? { AND: andClauses } : {}) },
      include: SUGGESTION_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as SuggestionRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map((row) => toCardTestSuggestion(row, team.userId)),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.createdAt, last.id) : null,
    };
  }

  /**
   * Create a suggestion for one of the team's decks. Validates the deck belongs to
   * the team and is not archived (no new suggestions on an archived deck), and that
   * both cards belong to the team's game. Stamps `authorId` from the verified context.
   */
  async create(
    team: TeamContext,
    input: CreateCardTestSuggestionInput,
  ): Promise<CardTestSuggestion> {
    await this.assertActiveTeamDeck(input.deckId);
    await this.assertCardInGame(team.gameId, input.cardInId);
    if (input.cardOutId !== undefined) {
      await this.assertCardInGame(team.gameId, input.cardOutId);
    }

    const created = (await this.scoped.db.cardTestSuggestion.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps teamId);
        // never from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        authorId: team.userId,
        deckId: input.deckId,
        cardInId: input.cardInId,
        cardOutId: input.cardOutId ?? null,
        reasoning: input.reasoning,
      },
    })) as SuggestionRow;

    await this.recordActivity(team, created.id, "card_test_suggestion_created");
    return this.requireSuggestion(team, created.id);
  }

  /**
   * Edit a suggestion. Only the author or a team-admin may (404 before 403). A
   * `status` change is validated against the lifecycle and, when resolving, requires
   * a resolution note (merged from the input and the stored row).
   */
  async update(
    team: TeamContext,
    suggestionId: string,
    input: UpdateCardTestSuggestionInput,
  ): Promise<CardTestSuggestion> {
    const current = await this.loadModifiableSuggestion(team, suggestionId);

    const data: Record<string, unknown> = {};

    const mergedCardIn = input.cardInId ?? current.cardInId;
    if (input.cardInId !== undefined) {
      await this.assertCardInGame(team.gameId, input.cardInId);
      data["cardInId"] = input.cardInId;
    }
    if (input.cardOutId !== undefined) {
      if (input.cardOutId !== null) {
        await this.assertCardInGame(team.gameId, input.cardOutId);
      }
      data["cardOutId"] = input.cardOutId;
    }
    const mergedCardOut = input.cardOutId !== undefined ? input.cardOutId : current.cardOutId;
    if (mergedCardOut !== null && mergedCardOut === mergedCardIn) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "The card to cut must differ from the card to test.",
        },
      });
    }

    if (input.reasoning !== undefined) data["reasoning"] = input.reasoning;
    if (input.resolutionNote !== undefined) data["resolutionNote"] = input.resolutionNote;

    const statusChanged = input.status !== undefined && input.status !== current.status;
    if (input.status !== undefined) {
      if (statusChanged) {
        assertSuggestionStatusTransition(current.status, input.status);
      }
      const mergedNote = input.resolutionNote ?? current.resolutionNote;
      assertResolutionNotePresent(input.status, mergedNote);
      data["status"] = input.status;
    }

    await this.scoped.db.cardTestSuggestion.updateMany({ where: { id: suggestionId }, data });
    await this.recordActivity(
      team,
      suggestionId,
      statusChanged ? "card_test_suggestion_status_changed" : "card_test_suggestion_updated",
    );
    return this.requireSuggestion(team, suggestionId);
  }

  /** Soft-delete (archive) a suggestion; retained for history, dropped from lists. */
  async archive(team: TeamContext, suggestionId: string): Promise<void> {
    await this.loadModifiableSuggestion(team, suggestionId);
    await this.scoped.db.cardTestSuggestion.updateMany({
      where: { id: suggestionId },
      data: { archivedAt: new Date() },
    });
  }

  /**
   * Cast (or re-affirm) the requesting member's upvote — idempotent: repeated calls
   * keep exactly one row per member. The vote is reached only through its
   * team-scoped parent suggestion, verified visible + active first.
   */
  async castVote(team: TeamContext, suggestionId: string): Promise<CardTestSuggestion> {
    await this.requireActiveSuggestionRow(suggestionId);
    await this.scoped.db.suggestionVote.upsert({
      where: { suggestionId_userId: { suggestionId, userId: team.userId } },
      create: { suggestionId, userId: team.userId },
      update: {},
    });
    return this.requireSuggestion(team, suggestionId);
  }

  /** Retract the requesting member's upvote (no-op if they had not voted). */
  async retractVote(team: TeamContext, suggestionId: string): Promise<void> {
    await this.requireActiveSuggestionRow(suggestionId);
    await this.scoped.db.suggestionVote.deleteMany({
      where: { suggestionId, userId: team.userId },
    });
  }

  /** Record a suggestion lifecycle action on the team activity feed. */
  private async recordActivity(
    team: TeamContext,
    suggestionId: string,
    verb:
      | "card_test_suggestion_created"
      | "card_test_suggestion_updated"
      | "card_test_suggestion_status_changed",
  ): Promise<void> {
    await this.activity.recordActivity(team, {
      verb,
      subjectType: "card_test_suggestion",
      subjectId: suggestionId,
    });
  }

  /** Load a non-archived suggestion the acting member may modify, else 404 (before 403). */
  private async loadModifiableSuggestion(
    team: TeamContext,
    suggestionId: string,
  ): Promise<SuggestionRow> {
    const row = await this.requireActiveSuggestionRow(suggestionId);
    if (!canModifySuggestion(team, row)) {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "Only the suggestion's author or a team-admin may change it.",
        },
      });
    }
    return row;
  }

  /** Read a non-archived suggestion (team-scoped), or throw 404. */
  private async requireActiveSuggestionRow(suggestionId: string): Promise<SuggestionRow> {
    const row = (await this.scoped.db.cardTestSuggestion.findFirst({
      where: { id: suggestionId, archivedAt: null },
      include: SUGGESTION_INCLUDE,
    })) as SuggestionRow | null;
    if (!row) {
      throw suggestionNotFound();
    }
    return row;
  }

  /** Read + map a suggestion after a write (throws 404 if it vanished). */
  private async requireSuggestion(
    team: TeamContext,
    suggestionId: string,
  ): Promise<CardTestSuggestion> {
    const row = await this.requireActiveSuggestionRow(suggestionId);
    return toCardTestSuggestion(row, team.userId);
  }

  /** Reject a `deckId` that is not one of the team's non-archived decks (→ 422). */
  private async assertActiveTeamDeck(deckId: string): Promise<void> {
    const deck = await this.scoped.db.deck.findFirst({
      where: { id: deckId },
      select: { archivedAt: true },
    });
    if (!deck) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "The deck does not belong to this team.",
        },
      });
    }
    if (deck.archivedAt !== null) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "Cannot create a suggestion on an archived deck.",
        },
      });
    }
  }

  /** Reject a `cardId` that does not belong to the team's game (→ 422). */
  private async assertCardInGame(gameId: string, cardId: string): Promise<void> {
    // `card` is a global model; the scoping proxy passes this query through
    // untouched, filtered explicitly by the team's game (matching game-logging).
    const card = await this.scoped.db.card.findFirst({
      where: { id: cardId, gameId },
      select: { id: true },
    });
    if (!card) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "A referenced card does not belong to this team's game.",
        },
      });
    }
  }
}

function suggestionNotFound(): NotFoundException {
  return new NotFoundException({
    error: { code: errorCode.notFound, message: "Card-test suggestion not found." },
  });
}

function toCardSummary(card: CardRow): CardTestSuggestion["cardIn"] {
  return { id: card.id, name: card.name, pitch: card.pitch, imageUrl: card.imageUrl };
}

function toCardTestSuggestion(row: SuggestionRow, viewerUserId: string): CardTestSuggestion {
  return {
    id: row.id,
    deckId: row.deckId,
    author: {
      userId: row.author.id,
      username: row.author.username ?? "",
      displayName: row.author.displayName,
    },
    cardIn: toCardSummary(row.cardIn),
    cardOut: row.cardOut ? toCardSummary(row.cardOut) : null,
    reasoning: row.reasoning,
    status: row.status,
    resolutionNote: row.resolutionNote,
    voteCount: row.votes.length,
    viewerHasVoted: row.votes.some((vote) => vote.userId === viewerUserId),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
