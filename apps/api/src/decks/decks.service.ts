import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

import {
  type CreateDeckInput,
  type DeckDetail,
  type DeckLinkedMeta,
  type DeckListQuery,
  type DeckListResponse,
  type DeckStatus,
  type DeckSummary,
  errorCode,
  type IterationEntry,
  type IterationEntryList,
  type RecognizedDeckUrl,
  type UpdateDeckInput,
} from "@teambrewer/shared";

import { CollaborationActivityService } from "../collaboration/activity.service.js";
import { decodeKeysetCursor, encodeKeysetCursor } from "../common/keyset-cursor.js";
import { assertFormatInGame, assertHeroInGame } from "../common/reference-data-guards.js";
import { GAME_CATALOG } from "../games/game-catalog.js";
import { GameAdapterRegistry } from "../games/game-adapter.registry.js";
import { resolveCurrentMeta } from "../metas/current-meta.js";
import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";
import { canModifyDeck, isDeckVisibleTo } from "./deck-authorization.js";
import { assertDeckStatusTransition } from "./status-transition.js";

/** The persisted deck shape this service maps to the shared contracts. */
interface DeckRow {
  id: string;
  teamId: string;
  name: string;
  gameId: string;
  formatId: string;
  heroId: string | null;
  externalUrl: string;
  source: string;
  ownerId: string;
  status: DeckStatus;
  visibility: "team" | "private";
  isReference: boolean;
  tags: string[];
  notes: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Fallback `source` label for a link no adapter recognized. */
const UNRECOGNIZED_SOURCE = "other";

/**
 * Team-scoped deck CRUD, status lifecycle, and the manual iteration log
 * (docs/features/decks.md). Every deck query goes through {@link TeamScopedPrisma}
 * so it is filtered by the verified `teamId`; a cross-tenant id simply yields no
 * row (→ 404). Ownership/visibility are enforced per-resource on top of that.
 * Decks are links (ADR-0002): the service stores metadata only and never fetches
 * or parses the linked contents.
 */
@Injectable()
export class DecksService {
  constructor(
    private readonly scoped: TeamScopedPrisma,
    private readonly gameAdapters: GameAdapterRegistry,
    private readonly activity: CollaborationActivityService,
  ) {}

  /** List the team's decks with filters + keyset pagination (newest first). */
  async list(team: TeamContext, query: DeckListQuery): Promise<DeckListResponse> {
    const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;

    const andClauses: Record<string, unknown>[] = [];
    // Non-admins never see another member's private drafts.
    if (team.role !== "team_admin") {
      andClauses.push({ OR: [{ visibility: "team" }, { ownerId: team.userId }] });
    }
    if (cursor) {
      andClauses.push({
        OR: [
          { createdAt: { lt: cursor.sortValue } },
          { createdAt: cursor.sortValue, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = (await this.scoped.db.deck.findMany({
      where: {
        archivedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.formatId ? { formatId: query.formatId } : {}),
        ...(query.heroId ? { heroId: query.heroId } : {}),
        ...(query.ownerId ? { ownerId: query.ownerId } : {}),
        ...(query.isReference !== undefined ? { isReference: query.isReference } : {}),
        ...(query.visibility ? { visibility: query.visibility } : {}),
        ...(query.tag ? { tags: { has: query.tag } } : {}),
        ...(andClauses.length > 0 ? { AND: andClauses } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
    })) as DeckRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map(toDeckSummary),
      nextCursor: hasMore && last ? encodeKeysetCursor(last.createdAt, last.id) : null,
    };
  }

  /** A single deck (404 when missing, cross-tenant, or a private draft the caller can't see). */
  async getDeck(team: TeamContext, deckId: string): Promise<DeckDetail> {
    const deck = await this.loadVisibleDeck(team, deckId);
    return toDeckDetail(deck, await this.loadLinkedMetas(deckId));
  }

  /**
   * Create a deck; stamps teamId/gameId/ownerId from context and recognizes the link.
   * Links metas per {@link CreateDeckInput.metaIds}: omitting it links the current
   * meta by default; passing it (even an empty array) overrides that.
   */
  async create(team: TeamContext, input: CreateDeckInput): Promise<DeckDetail> {
    await assertFormatInGame(this.scoped.db, team.gameId, input.formatId);
    if (input.heroId) {
      await assertHeroInGame(this.scoped.db, team.gameId, input.heroId);
    }
    const metaIdsToLink = await this.resolveMetaIdsToLink(input.metaIds);

    const recognized = this.recognizeUrl(team.gameId, input.externalUrl);
    const created = (await this.scoped.db.deck.create({
      data: {
        // Stamped from the verified context (TeamScopedPrisma re-stamps the same
        // value); never from the client body. See multi-tenancy.md.
        teamId: team.teamId,
        name: input.name,
        gameId: team.gameId,
        formatId: input.formatId,
        heroId: input.heroId ?? null,
        externalUrl: input.externalUrl,
        source: recognized?.provider ?? UNRECOGNIZED_SOURCE,
        ownerId: team.userId,
        visibility: input.visibility,
        isReference: input.isReference,
        tags: input.tags,
        notes: input.notes,
      },
    })) as DeckRow;
    await this.replaceDeckMetaLinks(created.id, metaIdsToLink);
    await this.recordDeckActivity(team, created, "deck_created");
    return this.getDeck(team, created.id);
  }

  /** Update a deck's metadata (owner or team-admin). Status is not editable here. */
  async update(team: TeamContext, deckId: string, input: UpdateDeckInput): Promise<DeckDetail> {
    const deck = await this.loadModifiableDeck(team, deckId);

    if (input.formatId !== undefined) {
      await assertFormatInGame(this.scoped.db, team.gameId, input.formatId);
    }
    if (input.heroId) {
      await assertHeroInGame(this.scoped.db, team.gameId, input.heroId);
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data["name"] = input.name;
    if (input.formatId !== undefined) data["formatId"] = input.formatId;
    if (input.heroId !== undefined) data["heroId"] = input.heroId;
    if (input.visibility !== undefined) data["visibility"] = input.visibility;
    if (input.isReference !== undefined) data["isReference"] = input.isReference;
    if (input.tags !== undefined) data["tags"] = input.tags;
    if (input.notes !== undefined) data["notes"] = input.notes;
    if (input.externalUrl !== undefined && input.externalUrl !== deck.externalUrl) {
      data["externalUrl"] = input.externalUrl;
      data["source"] =
        this.recognizeUrl(team.gameId, input.externalUrl)?.provider ?? UNRECOGNIZED_SOURCE;
    }

    // `metaIds` is not a deck column — a provided set replaces the deck's links.
    if (Object.keys(data).length > 0) {
      await this.scoped.db.deck.updateMany({ where: { id: deckId }, data });
    }
    if (input.metaIds !== undefined) {
      await this.replaceDeckMetaLinks(deckId, await this.assertTeamMetas(input.metaIds));
    }
    const updated = await this.getDeck(team, deckId);
    await this.recordDeckActivity(team, updated, "deck_updated");
    return updated;
  }

  /** Move a deck through its status lifecycle (validated transition; owner or team-admin). */
  async changeStatus(team: TeamContext, deckId: string, status: DeckStatus): Promise<DeckDetail> {
    const deck = await this.loadModifiableDeck(team, deckId);
    assertDeckStatusTransition(deck.status, status);
    await this.scoped.db.deck.updateMany({ where: { id: deckId }, data: { status } });
    const updated = await this.getDeck(team, deckId);
    await this.recordDeckActivity(team, updated, "deck_status_changed");
    return updated;
  }

  /** Soft-delete (archive) a deck (owner or team-admin); history survives. */
  async archive(team: TeamContext, deckId: string): Promise<void> {
    await this.loadModifiableDeck(team, deckId);
    await this.scoped.db.deck.updateMany({
      where: { id: deckId },
      data: { archivedAt: new Date() },
    });
  }

  /** A deck's iteration log, most-recent first (requires being able to see the deck). */
  async listIterations(team: TeamContext, deckId: string): Promise<IterationEntryList> {
    await this.loadVisibleDeck(team, deckId);
    const entries = await this.scoped.db.deckIterationEntry.findMany({
      where: { deckId },
      orderBy: { createdAt: "desc" },
    });
    return { data: entries.map(toIterationEntry) };
  }

  /** Append an iteration-log entry (owner or team-admin; others comment instead). */
  async addIteration(team: TeamContext, deckId: string, body: string): Promise<IterationEntry> {
    await this.loadModifiableDeck(team, deckId);
    const entry = await this.scoped.db.deckIterationEntry.create({
      data: { deckId, authorId: team.userId, body },
    });
    return toIterationEntry(entry);
  }

  /** Best-effort deck-URL recognition (URL-pattern only, never a content fetch). */
  recognizeUrl(gameId: string, url: string): RecognizedDeckUrl {
    const entry = GAME_CATALOG.find((catalogEntry) => catalogEntry.id === gameId);
    if (!entry || !this.gameAdapters.has(entry.key)) {
      return null;
    }
    return this.gameAdapters.get(entry.key).recognizeDeckUrl?.(url) ?? null;
  }

  /**
   * Record a deck lifecycle event on the team activity feed. Private drafts are
   * skipped so the team-wide feed never leaks a personal draft's existence
   * (multi-tenancy.md; mirrors DeckSubjectResolver's `isTeamVisible`).
   */
  private async recordDeckActivity(
    team: TeamContext,
    deck: { id: string; visibility: string },
    verb: "deck_created" | "deck_updated" | "deck_status_changed",
  ): Promise<void> {
    if (deck.visibility !== "team") {
      return;
    }
    await this.activity.recordActivity(team, {
      verb,
      subjectType: "deck",
      subjectId: deck.id,
    });
  }

  /**
   * The metas to link on deck-create. `undefined` (omitted) links the current meta
   * by default (or nothing when none is current); an explicit list (even empty) is
   * validated same-team and used as-is.
   */
  private async resolveMetaIdsToLink(metaIds: string[] | undefined): Promise<string[]> {
    if (metaIds !== undefined) {
      return this.assertTeamMetas(metaIds);
    }
    const candidates = (await this.scoped.db.meta.findMany({
      where: { archivedAt: null },
      select: { id: true, startDate: true, endDate: true, createdAt: true },
    })) as { id: string; startDate: Date; endDate: Date; createdAt: Date }[];
    const current = resolveCurrentMeta(candidates, new Date());
    return current ? [current.id] : [];
  }

  /** Reject any meta id that is not a non-archived meta of the team (cross-team → 422). */
  private async assertTeamMetas(metaIds: string[]): Promise<string[]> {
    for (const metaId of metaIds) {
      const meta = await this.scoped.db.meta.findFirst({
        where: { id: metaId, archivedAt: null },
        select: { id: true },
      });
      if (!meta) {
        throw new UnprocessableEntityException({
          error: {
            code: errorCode.domainRuleViolation,
            message: "A linked meta does not belong to this team.",
          },
        });
      }
    }
    return metaIds;
  }

  /**
   * Replace a deck's `DeckMeta` links with exactly `metaIds`. The parent deck is
   * already verified team-scoped, so operating on its transitive join rows by
   * `deckId` is safe (DeckMeta carries no `teamId`; it is reached through its parents).
   */
  private async replaceDeckMetaLinks(deckId: string, metaIds: string[]): Promise<void> {
    await this.scoped.db.deckMeta.deleteMany({ where: { deckId } });
    if (metaIds.length > 0) {
      await this.scoped.db.deckMeta.createMany({
        data: metaIds.map((metaId) => ({ deckId, metaId })),
      });
    }
  }

  /** A deck's linked metas (id + name), newest-window first, for the detail response. */
  private async loadLinkedMetas(deckId: string): Promise<DeckLinkedMeta[]> {
    const links = (await this.scoped.db.deckMeta.findMany({
      where: { deckId },
      include: { meta: { select: { id: true, name: true, startDate: true } } },
      orderBy: { meta: { startDate: "desc" } },
    })) as { meta: { id: string; name: string; startDate: Date } }[];
    return links.map((link) => ({ id: link.meta.id, name: link.meta.name }));
  }

  /** Load a deck the caller may see, or throw 404 (also hides private drafts). */
  private async loadVisibleDeck(team: TeamContext, deckId: string): Promise<DeckRow> {
    const deck = (await this.scoped.db.deck.findFirst({ where: { id: deckId } })) as DeckRow | null;
    if (!deck || deck.archivedAt !== null || !isDeckVisibleTo(team, deck)) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Deck not found." },
      });
    }
    return deck;
  }

  /** Load a deck the caller may modify: 404 if not visible, 403 if visible but not owner/admin. */
  private async loadModifiableDeck(team: TeamContext, deckId: string): Promise<DeckRow> {
    const deck = await this.loadVisibleDeck(team, deckId);
    if (!canModifyDeck(team, deck)) {
      throw new ForbiddenException({
        error: {
          code: errorCode.forbidden,
          message: "You can only modify your own decks.",
        },
      });
    }
    return deck;
  }
}

function toDeckSummary(deck: DeckRow): DeckSummary {
  return {
    id: deck.id,
    name: deck.name,
    gameId: deck.gameId,
    formatId: deck.formatId,
    heroId: deck.heroId,
    externalUrl: deck.externalUrl,
    source: deck.source,
    ownerId: deck.ownerId,
    status: deck.status,
    visibility: deck.visibility,
    isReference: deck.isReference,
    tags: deck.tags,
    archivedAt: deck.archivedAt ? deck.archivedAt.toISOString() : null,
    createdAt: deck.createdAt.toISOString(),
    updatedAt: deck.updatedAt.toISOString(),
  };
}

function toDeckDetail(deck: DeckRow, linkedMetas: DeckLinkedMeta[]): DeckDetail {
  return { ...toDeckSummary(deck), notes: deck.notes, linkedMetas };
}

function toIterationEntry(entry: {
  id: string;
  deckId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}): IterationEntry {
  return {
    id: entry.id,
    deckId: entry.deckId,
    authorId: entry.authorId,
    body: entry.body,
    createdAt: entry.createdAt.toISOString(),
  };
}
