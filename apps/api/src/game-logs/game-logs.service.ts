import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  type BestOf,
  type ConfidenceFactors,
  type CreateGameLogInput,
  deriveConfidenceWeight,
  type GameLogDetail,
  type GameLogListQuery,
  type GameLogListResponse,
  type GameLogSummary,
  type GameResult,
  type GameSide,
  errorCode,
  isGameResultConsistent,
  type LossReason,
  type PlayerCategory,
  type UpdateGameLogInput,
  type WinType,
} from "@teambrewer/shared";

import { CollaborationActivityService } from "../collaboration/activity.service.js";
import { decodeKeysetCursor, encodeKeysetCursor } from "../common/keyset-cursor.js";
import { assertFormatInGame, assertHeroInGame } from "../common/reference-data-guards.js";
import { findMostRecentMetaForFormat } from "../metas/most-recent-meta.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";
import { canModifyGameLog } from "./game-log-authorization.js";

/** The persisted game-log shape this service maps to the shared contracts. */
interface GameLogRow {
  id: string;
  teamId: string;
  loggedById: string;
  formatId: string;
  metaId: string | null;
  playedAt: Date;
  selfPlayerCategory: PlayerCategory;
  deckId: string | null;
  selfMetaDeckEntryId: string | null;
  selfHeroId: string | null;
  selfArchetypeLabel: string | null;
  opponentPlayerCategory: PlayerCategory;
  opponentDeckId: string | null;
  opponentMetaDeckEntryId: string | null;
  opponentHeroId: string | null;
  opponentArchetypeLabel: string | null;
  firstPlayerSide: GameSide;
  bestOf: number;
  gamesWonA: number;
  gamesWonB: number;
  winType: WinType | null;
  lossReason: LossReason | null;
  learnings: string;
  skillParity: ConfidenceFactors["skillParity"];
  seriousness: ConfidenceFactors["seriousness"];
  deckMaturity: ConfidenceFactors["deckMaturity"];
  pilotFamiliarity: ConfidenceFactors["pilotFamiliarity"];
  confidenceWeight: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  cards?: {
    role: "impressive" | "underperforming";
    side: "ours" | "theirs";
    card: { id: string; name: string; pitch: number | null; imageUrl: string | null };
  }[];
}

/** Resolved, validated side-A (self) columns ready to persist. */
interface ResolvedSideA {
  selfPlayerCategory: PlayerCategory;
  deckId: string | null;
  selfMetaDeckEntryId: string | null;
  selfHeroId: string | null;
  selfArchetypeLabel: string | null;
}

/** Resolved, validated side-B (opponent) columns ready to persist. */
interface ResolvedSideB {
  opponentPlayerCategory: PlayerCategory;
  opponentDeckId: string | null;
  opponentMetaDeckEntryId: string | null;
  opponentHeroId: string | null;
  opponentArchetypeLabel: string | null;
}

/**
 * Team-scoped game logging (docs/features/game-logging.md, ADR-0005). Every query
 * goes through {@link TeamScopedPrisma} so it is filtered by the verified `teamId`;
 * a cross-tenant id yields no row (→ 404, never leaking existence). The
 * `confidenceWeight` is always derived server-side from the four factors via the
 * shared {@link deriveConfidenceWeight} (a client-supplied weight is impossible —
 * it is not an input field). The logger and team-admins may edit/archive a log.
 */
@Injectable()
export class GameLogsService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly activity: CollaborationActivityService,
  ) {}

  /**
   * List the team's game logs with filters + keyset pagination (most recently
   * played first). `deckId` matches either side; `heroId` matches the opponent
   * identity (our side's hero lives on its deck, not the log). Archived logs are
   * excluded.
   */
  async list(query: GameLogListQuery): Promise<GameLogListResponse> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;

    const andClauses: Record<string, unknown>[] = [];
    if (query.formatId) andClauses.push({ formatId: query.formatId });
    if (query.metaId) andClauses.push({ metaId: query.metaId });
    if (query.deckId) {
      andClauses.push({ OR: [{ deckId: query.deckId }, { opponentDeckId: query.deckId }] });
    }
    if (query.heroId) {
      andClauses.push({ OR: [{ selfHeroId: query.heroId }, { opponentHeroId: query.heroId }] });
    }
    if (cursor) {
      andClauses.push({
        OR: [
          { playedAt: { lt: cursor.sortValue } },
          { playedAt: cursor.sortValue, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = (await this.scoped.db.gameLog.findMany({
      where: { archivedAt: null, ...(andClauses.length > 0 ? { AND: andClauses } : {}) },
      orderBy: [{ playedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as GameLogRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(toGameLogSummary),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.playedAt, last.id) : null,
    };
  }

  /** A single game log (404 when missing/cross-tenant/archived). */
  async getGameLog(gameLogId: string): Promise<GameLogDetail> {
    const row = await this.findGameLog(gameLogId, { includeArchived: false });
    if (!row) {
      throw gameLogNotFound();
    }
    return toGameLogDetail(row);
  }

  /**
   * Log a game. Validates every referenced foreign key against the team/game,
   * checks the opponent-identity + result/best-of rules, derives the confidence
   * weight server-side, and stamps `teamId`/`loggedById` from the verified context.
   */
  async create(team: TeamContext, input: CreateGameLogInput): Promise<GameLogDetail> {
    await assertFormatInGame(this.scoped.db, team.gameId, input.formatId);
    this.assertResultConsistent(input.bestOf, input.result);
    const playedAt = input.playedAt ? new Date(input.playedAt) : new Date();
    const metaId = await this.resolveMetaId(input.metaId, input.formatId);
    const sideA = await this.resolveSideA(team.gameId, input.sideA);
    const sideB = await this.resolveSideB(team.gameId, input.sideB);
    const capturedCards = await this.resolveCapturedCards(
      team.gameId,
      input.impressiveCards,
      input.underperformingCards,
    );

    const confidenceWeight = deriveConfidenceWeight(input.confidenceFactors);

    const created = (await this.scoped.db.gameLog.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps the same
        // teamId); never from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        loggedById: team.userId,
        formatId: input.formatId,
        metaId,
        playedAt,
        selfPlayerCategory: sideA.selfPlayerCategory,
        deckId: sideA.deckId,
        selfMetaDeckEntryId: sideA.selfMetaDeckEntryId,
        selfHeroId: sideA.selfHeroId,
        selfArchetypeLabel: sideA.selfArchetypeLabel,
        opponentPlayerCategory: sideB.opponentPlayerCategory,
        opponentDeckId: sideB.opponentDeckId,
        opponentMetaDeckEntryId: sideB.opponentMetaDeckEntryId,
        opponentHeroId: sideB.opponentHeroId,
        opponentArchetypeLabel: sideB.opponentArchetypeLabel,
        firstPlayerSide: input.firstPlayerSide,
        bestOf: input.bestOf,
        gamesWonA: input.result.gamesWonA,
        gamesWonB: input.result.gamesWonB,
        winType: input.winType ?? null,
        lossReason: input.lossReason ?? null,
        learnings: input.learnings,
        skillParity: input.confidenceFactors.skillParity,
        seriousness: input.confidenceFactors.seriousness,
        deckMaturity: input.confidenceFactors.deckMaturity,
        pilotFamiliarity: input.confidenceFactors.pilotFamiliarity,
        confidenceWeight,
        cards: { create: capturedCards },
      },
    })) as GameLogRow;

    await this.recordActivity(team, created.id, "game_log_created");
    return this.requireGameLogDetail(created.id, { includeArchived: false });
  }

  /**
   * Edit a game log. Only the logger or a team-admin may (404 before 403). Changing
   * any confidence factor re-derives the weight (merged with the stored factors);
   * changing `bestOf`/`result` re-checks consistency against the merged values.
   */
  async update(
    team: TeamContext,
    gameLogId: string,
    input: UpdateGameLogInput,
  ): Promise<GameLogDetail> {
    const current = await this.loadModifiableGameLog(team, gameLogId);

    const data: Record<string, unknown> = {};
    if (input.formatId !== undefined) {
      await assertFormatInGame(this.scoped.db, team.gameId, input.formatId);
      data["formatId"] = input.formatId;
    }
    if (input.metaId !== undefined) {
      if (input.metaId !== null) {
        await this.assertMetaInTeam(input.metaId);
      }
      data["metaId"] = input.metaId;
    }
    if (input.playedAt !== undefined) data["playedAt"] = new Date(input.playedAt);
    if (input.sideA !== undefined) {
      const sideA = await this.resolveSideA(team.gameId, input.sideA);
      Object.assign(data, sideA);
    }
    if (input.sideB !== undefined) {
      const sideB = await this.resolveSideB(team.gameId, input.sideB);
      Object.assign(data, sideB);
    }
    if (input.firstPlayerSide !== undefined) data["firstPlayerSide"] = input.firstPlayerSide;

    const bestOf = (input.bestOf ?? current.bestOf) as BestOf;
    const result: GameResult = input.result ?? {
      gamesWonA: current.gamesWonA,
      gamesWonB: current.gamesWonB,
    };
    if (input.bestOf !== undefined || input.result !== undefined) {
      this.assertResultConsistent(bestOf, result);
      data["bestOf"] = bestOf;
      data["gamesWonA"] = result.gamesWonA;
      data["gamesWonB"] = result.gamesWonB;
    }
    if (input.winType !== undefined) data["winType"] = input.winType;
    if (input.lossReason !== undefined) data["lossReason"] = input.lossReason;
    if (input.learnings !== undefined) data["learnings"] = input.learnings;

    if (input.confidenceFactors !== undefined) {
      const merged: ConfidenceFactors = {
        skillParity: input.confidenceFactors.skillParity ?? current.skillParity,
        seriousness: input.confidenceFactors.seriousness ?? current.seriousness,
        deckMaturity: input.confidenceFactors.deckMaturity ?? current.deckMaturity,
        pilotFamiliarity: input.confidenceFactors.pilotFamiliarity ?? current.pilotFamiliarity,
      };
      data["skillParity"] = merged.skillParity;
      data["seriousness"] = merged.seriousness;
      data["deckMaturity"] = merged.deckMaturity;
      data["pilotFamiliarity"] = merged.pilotFamiliarity;
      data["confidenceWeight"] = deriveConfidenceWeight(merged);
    }

    // Validate any provided captured cards against the team's game BEFORE the scalar
    // field write, so a PATCH carrying a cross-game card rejects with 422 without
    // committing the other field edits (no partial write).
    if (input.impressiveCards !== undefined) {
      await this.assertCardsInGame(team.gameId, input.impressiveCards);
    }
    if (input.underperformingCards !== undefined) {
      await this.assertCardsInGame(team.gameId, input.underperformingCards);
    }

    await this.scoped.db.gameLog.updateMany({ where: { id: gameLogId }, data });

    if (input.impressiveCards !== undefined || input.underperformingCards !== undefined) {
      const gameId = team.gameId;
      if (input.impressiveCards !== undefined) {
        await this.replaceCapturedCards(gameLogId, gameId, "impressive", input.impressiveCards);
      }
      if (input.underperformingCards !== undefined) {
        await this.replaceCapturedCards(
          gameLogId,
          gameId,
          "underperforming",
          input.underperformingCards,
        );
      }
    }

    await this.recordActivity(team, gameLogId, "game_log_updated");
    return this.requireGameLogDetail(gameLogId, { includeArchived: false });
  }

  /** Soft-delete (archive) a game log; excluded from aggregates but retained. */
  async archive(team: TeamContext, gameLogId: string): Promise<void> {
    await this.loadModifiableGameLog(team, gameLogId);
    await this.scoped.db.gameLog.updateMany({
      where: { id: gameLogId },
      data: { archivedAt: new Date() },
    });
  }

  /** Record a game-log lifecycle action on the team activity feed. */
  private async recordActivity(
    team: TeamContext,
    gameLogId: string,
    verb: "game_log_created" | "game_log_updated",
  ): Promise<void> {
    await this.activity.recordActivity(team, {
      verb,
      subjectType: "game_log",
      subjectId: gameLogId,
    });
  }

  /** Load a non-archived log the acting member may modify, else 404 (before 403). */
  private async loadModifiableGameLog(team: TeamContext, gameLogId: string): Promise<GameLogRow> {
    const row = (await this.scoped.db.gameLog.findFirst({
      where: { id: gameLogId, archivedAt: null },
    })) as GameLogRow | null;
    if (!row) {
      throw gameLogNotFound();
    }
    if (!canModifyGameLog(team, row)) {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "Only the member who logged this game or a team-admin may change it.",
        },
      });
    }
    return row;
  }

  /** Validate the result/best-of pairing (→ 422), sharing the schema's rule. */
  private assertResultConsistent(bestOf: number, result: GameResult): void {
    if (!isGameResultConsistent(bestOf, result)) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "The result is not consistent with the best-of.",
        },
      });
    }
  }

  /**
   * Resolve the meta a created log counts toward. When the client supplies a `metaId`
   * it is honored (a supplied id is validated same-team; `null` records no meta). When
   * omitted (`undefined`), the most recent meta of the log's own format is auto-suggested
   * (greatest `startDate`, non-archived; null when that format has no meta).
   */
  private async resolveMetaId(
    suppliedMetaId: string | null | undefined,
    formatId: string,
  ): Promise<string | null> {
    if (suppliedMetaId === null) {
      return null;
    }
    if (suppliedMetaId !== undefined) {
      await this.assertMetaInTeam(suppliedMetaId);
      return suppliedMetaId;
    }
    const mostRecent = await findMostRecentMetaForFormat(this.scoped.db, formatId);
    return mostRecent?.id ?? null;
  }

  /** Reject a `metaId` that does not belong to the team (cross-team FK → 404). */
  private async assertMetaInTeam(metaId: string): Promise<void> {
    const meta = await this.scoped.db.meta.findFirst({
      where: { id: metaId },
      select: { id: true },
    });
    if (!meta) {
      throw metaNotFound();
    }
  }

  /**
   * Validate + normalize a matchup subject (a team deck, a meta deck entry, or a
   * hero with an optional archetype label) into its neutral columns. The
   * exactly-one shape is already enforced by the shared schema; this adds the
   * cross-team/game FK checks (→ 422). Returns generic keys the callers map onto the
   * self- or opponent-prefixed columns.
   */
  private async resolveMatchupSubject(
    gameId: string,
    subject: {
      deckId?: string | undefined;
      metaDeckEntryId?: string | undefined;
      heroId?: string | undefined;
      archetypeLabel?: string | undefined;
    },
    sideLabel: string,
  ): Promise<{
    deckId: string | null;
    metaDeckEntryId: string | null;
    heroId: string | null;
    archetypeLabel: string | null;
  }> {
    const empty = { deckId: null, metaDeckEntryId: null, heroId: null, archetypeLabel: null };
    if (subject.deckId !== undefined) {
      await this.assertTeamDeck(
        subject.deckId,
        `The ${sideLabel} deck does not belong to this team.`,
      );
      return { ...empty, deckId: subject.deckId };
    }
    if (subject.metaDeckEntryId !== undefined) {
      await this.assertTeamMetaDeckEntry(
        subject.metaDeckEntryId,
        `The ${sideLabel} meta deck entry does not belong to this team.`,
      );
      return { ...empty, metaDeckEntryId: subject.metaDeckEntryId };
    }
    if (subject.heroId !== undefined) {
      await assertHeroInGame(this.scoped.db, gameId, subject.heroId);
    }
    return {
      ...empty,
      heroId: subject.heroId ?? null,
      archetypeLabel: subject.archetypeLabel ?? null,
    };
  }

  /**
   * Validate + normalize our side into its persisted columns. Our side is a matchup
   * subject (team deck / meta deck entry / hero + label) plus a `playerCategory`
   * classifying who piloted it (a same-team deck/entry is required; cross-team → 422).
   */
  private async resolveSideA(
    gameId: string,
    sideA: CreateGameLogInput["sideA"],
  ): Promise<ResolvedSideA> {
    const subject = await this.resolveMatchupSubject(gameId, sideA, "our side's");
    return {
      selfPlayerCategory: sideA.playerCategory,
      deckId: subject.deckId,
      selfMetaDeckEntryId: subject.metaDeckEntryId,
      selfHeroId: subject.heroId,
      selfArchetypeLabel: subject.archetypeLabel,
    };
  }

  /**
   * Validate + normalize the opponent side into its persisted columns. The opponent is
   * a matchup subject (any team deck / meta deck entry / hero + label) plus a
   * `playerCategory` classifying who piloted it. The exactly-one subject shape is
   * enforced by the schema; this adds the cross-team/game FK checks (→ 422).
   */
  private async resolveSideB(
    gameId: string,
    sideB: CreateGameLogInput["sideB"],
  ): Promise<ResolvedSideB> {
    const subject = await this.resolveMatchupSubject(gameId, sideB, "opponent");
    return {
      opponentPlayerCategory: sideB.playerCategory,
      opponentDeckId: subject.deckId,
      opponentMetaDeckEntryId: subject.metaDeckEntryId,
      opponentHeroId: subject.heroId,
      opponentArchetypeLabel: subject.archetypeLabel,
    };
  }

  /** Reject a `deckId` that does not belong to the team (cross-team FK → 422). */
  private async assertTeamDeck(deckId: string, message: string): Promise<void> {
    const deck = await this.scoped.db.deck.findFirst({
      where: { id: deckId },
      select: { id: true },
    });
    if (!deck) {
      throw new UnprocessableEntityException({
        error: { code: errorCode.domainRuleViolation, message },
      });
    }
  }

  /** Reject a meta-deck-entry id that does not belong to the team (cross-team FK → 422). */
  private async assertTeamMetaDeckEntry(metaDeckEntryId: string, message: string): Promise<void> {
    const entry = await this.scoped.db.metaDeckEntry.findFirst({
      where: { id: metaDeckEntryId },
      select: { id: true },
    });
    if (!entry) {
      throw new UnprocessableEntityException({
        error: { code: errorCode.domainRuleViolation, message },
      });
    }
  }

  /** Validate captured cards belong to the team's game and map to GameLogCard rows. */
  private async resolveCapturedCards(
    gameId: string,
    impressive: { cardId: string; side: "ours" | "theirs" }[],
    underperforming: { cardId: string; side: "ours" | "theirs" }[],
  ): Promise<
    { cardId: string; role: "impressive" | "underperforming"; side: "ours" | "theirs" }[]
  > {
    const all = [
      ...impressive.map((entry) => ({ ...entry, role: "impressive" as const })),
      ...underperforming.map((entry) => ({ ...entry, role: "underperforming" as const })),
    ];
    await this.assertCardsInGame(gameId, all);
    return all;
  }

  /** Replace the captured cards for one role on a log (validated against the game). */
  private async replaceCapturedCards(
    gameLogId: string,
    gameId: string,
    role: "impressive" | "underperforming",
    cards: { cardId: string; side: "ours" | "theirs" }[],
  ): Promise<void> {
    await this.assertCardsInGame(gameId, cards);
    // gameLogCard is reached only through its team-scoped parent; scope by the
    // parent id (already confirmed visible by loadModifiableGameLog above).
    await this.scoped.db.gameLogCard.deleteMany({ where: { gameLogId, role } });
    if (cards.length > 0) {
      await this.scoped.db.gameLogCard.createMany({
        data: cards.map((entry) => ({
          gameLogId,
          cardId: entry.cardId,
          role,
          side: entry.side,
        })),
      });
    }
  }

  /** Shared per-card game-validation used by both the create and update card paths (→ 422). */
  private async assertCardsInGame(gameId: string, entries: { cardId: string }[]): Promise<void> {
    for (const entry of entries) {
      // `card` is a global model; the scoping proxy passes this query through
      // untouched (matching assertHeroInGame), filtered explicitly by the team's game.
      const card = await this.scoped.db.card.findFirst({
        where: { id: entry.cardId, gameId },
        select: { id: true },
      });
      if (!card) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "A captured card does not belong to this team's game.",
          },
        });
      }
    }
  }

  /** Read a log honoring archived visibility (team-scoped by construction). */
  private async findGameLog(
    gameLogId: string,
    options: { includeArchived: boolean },
  ): Promise<GameLogRow | null> {
    const row = (await this.scoped.db.gameLog.findFirst({
      where: { id: gameLogId },
      include: {
        cards: { include: { card: true }, orderBy: { createdAt: "asc" } },
      },
    })) as GameLogRow | null;
    if (!row) {
      return null;
    }
    if (!options.includeArchived && row.archivedAt !== null) {
      return null;
    }
    return row;
  }

  /** Like {@link findGameLog} but throws 404 when absent (used after a write). */
  private async requireGameLogDetail(
    gameLogId: string,
    options: { includeArchived: boolean },
  ): Promise<GameLogDetail> {
    const row = await this.findGameLog(gameLogId, options);
    if (!row) {
      throw gameLogNotFound();
    }
    return toGameLogDetail(row);
  }
}

function gameLogNotFound(): NotFoundException {
  return new NotFoundException({
    error: { code: errorCode.notFound, message: "Game log not found." },
  });
}

function metaNotFound(): NotFoundException {
  return new NotFoundException({
    error: { code: errorCode.notFound, message: "Meta not found." },
  });
}

function toGameLogSummary(row: GameLogRow): GameLogSummary {
  return {
    id: row.id,
    loggedById: row.loggedById,
    formatId: row.formatId,
    metaId: row.metaId,
    playedAt: row.playedAt.toISOString(),
    sideA: {
      playerCategory: row.selfPlayerCategory,
      deckId: row.deckId,
      metaDeckEntryId: row.selfMetaDeckEntryId,
      heroId: row.selfHeroId,
      archetypeLabel: row.selfArchetypeLabel,
    },
    sideB: {
      playerCategory: row.opponentPlayerCategory,
      deckId: row.opponentDeckId,
      metaDeckEntryId: row.opponentMetaDeckEntryId,
      heroId: row.opponentHeroId,
      archetypeLabel: row.opponentArchetypeLabel,
    },
    firstPlayerSide: row.firstPlayerSide,
    bestOf: row.bestOf as BestOf,
    result: { gamesWonA: row.gamesWonA, gamesWonB: row.gamesWonB },
    winType: row.winType,
    lossReason: row.lossReason,
    confidenceWeight: row.confidenceWeight,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toGameLogDetail(row: GameLogRow): GameLogDetail {
  const cards = row.cards ?? [];
  const toCapturedCard = (
    card: (typeof cards)[number],
  ): GameLogDetail["impressiveCards"][number] => ({
    side: card.side,
    card: {
      id: card.card.id,
      name: card.card.name,
      pitch: card.card.pitch,
      imageUrl: card.card.imageUrl,
    },
  });
  return {
    ...toGameLogSummary(row),
    learnings: row.learnings,
    confidenceFactors: {
      skillParity: row.skillParity,
      seriousness: row.seriousness,
      deckMaturity: row.deckMaturity,
      pilotFamiliarity: row.pilotFamiliarity,
    },
    impressiveCards: cards.filter((card) => card.role === "impressive").map(toCapturedCard),
    underperformingCards: cards
      .filter((card) => card.role === "underperforming")
      .map(toCapturedCard),
  };
}
