import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";

import {
  type DeckSelection,
  type DeckSelectionList,
  errorCode,
  type SetDeckSelectionInput,
} from "@teambrewer/shared";

import type { TeamContext } from "../tenancy/team-context.js";
import { TeamScopedPrisma } from "../tenancy/team-scoped-prisma.js";
import {
  assertCanLockDeckSelection,
  assertDeckSelectionEditable,
} from "./deck-selection-authorization.js";

/** A teammate's display identity, resolved for the roster. */
interface UserRow {
  id: string;
  username: string | null;
  displayName: string;
}

/** The persisted deck-selection shape (with its relations) this service maps to the contract. */
interface DeckSelectionRow {
  id: string;
  eventId: string;
  deckId: string;
  reasoning: string;
  locked: boolean;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: UserRow;
  deck: { name: string; formatId: string };
}

const DECK_SELECTION_INCLUDE = {
  user: { select: { id: true, username: true, displayName: true } },
  deck: { select: { name: true, formatId: true } },
} as const;

/**
 * Team-scoped per-event deck selections (docs/features/gameplans-and-deck-selection.md
 * §Deck selection). A DeckSelection carries no `teamId`; it is reached only through its
 * team-scoped parent event (verified on every call), which is the tenant boundary — the
 * same pattern as attendance. A member upserts their own selection while it is unlocked;
 * only a team-admin locks/unlocks the roster.
 */
@Injectable()
export class DeckSelectionsService {
  constructor(private readonly scoped: TeamScopedPrisma) {}

  /** The full roster for an event (every member's selection + lock state). */
  async listForEvent(eventId: string): Promise<DeckSelectionList> {
    await this.requireEvent(eventId);
    const rows = (await this.scoped.db.deckSelection.findMany({
      where: { eventId },
      include: DECK_SELECTION_INCLUDE,
      orderBy: [{ createdAt: "asc" }],
    })) as DeckSelectionRow[];
    return { data: rows.map(toDeckSelection) };
  }

  /**
   * Upsert the caller's own selection for an event. `userId` comes from the verified
   * context (never the body). The deck must belong to the team (cross-team FK → 422).
   * If the caller already has a locked selection, the edit is rejected (→ 422) until a
   * team-admin unlocks it.
   */
  async setMine(
    team: TeamContext,
    eventId: string,
    input: SetDeckSelectionInput,
  ): Promise<DeckSelection> {
    await this.requireEvent(eventId);
    await this.assertTeamDeck(input.deckId);

    const existing = await this.scoped.db.deckSelection.findFirst({
      where: { eventId, userId: team.userId },
      select: { locked: true },
    });
    if (existing) {
      assertDeckSelectionEditable(existing.locked);
    }

    const row = (await this.scoped.db.deckSelection.upsert({
      where: { eventId_userId: { eventId, userId: team.userId } },
      create: { eventId, userId: team.userId, deckId: input.deckId, reasoning: input.reasoning },
      update: { deckId: input.deckId, reasoning: input.reasoning },
      include: DECK_SELECTION_INCLUDE,
    })) as DeckSelectionRow;
    return toDeckSelection(row);
  }

  /** Lock a selection (team-admin only), freezing it until unlocked. */
  async lock(team: TeamContext, eventId: string, selectionId: string): Promise<DeckSelection> {
    assertCanLockDeckSelection(team);
    await this.requireEvent(eventId);
    await this.requireSelection(eventId, selectionId);
    await this.scoped.db.deckSelection.updateMany({
      where: { id: selectionId },
      data: { locked: true, lockedAt: new Date() },
    });
    return toDeckSelection(await this.requireSelection(eventId, selectionId));
  }

  /** Unlock a selection (team-admin only), re-enabling member edits. */
  async unlock(team: TeamContext, eventId: string, selectionId: string): Promise<DeckSelection> {
    assertCanLockDeckSelection(team);
    await this.requireEvent(eventId);
    await this.requireSelection(eventId, selectionId);
    await this.scoped.db.deckSelection.updateMany({
      where: { id: selectionId },
      data: { locked: false, lockedAt: null },
    });
    return toDeckSelection(await this.requireSelection(eventId, selectionId));
  }

  /** Verify the parent event belongs to the team (the tenant boundary), or 404. */
  private async requireEvent(eventId: string): Promise<void> {
    const event = await this.scoped.db.event.findFirst({
      where: { id: eventId, archivedAt: null },
      select: { id: true },
    });
    if (!event) {
      throw eventNotFound();
    }
  }

  /** Load a selection that belongs to the event, or throw 404. */
  private async requireSelection(eventId: string, selectionId: string): Promise<DeckSelectionRow> {
    const row = (await this.scoped.db.deckSelection.findFirst({
      where: { id: selectionId, eventId },
      include: DECK_SELECTION_INCLUDE,
    })) as DeckSelectionRow | null;
    if (!row) {
      throw new NotFoundException({
        error: { code: errorCode.notFound, message: "Deck selection not found." },
      });
    }
    return row;
  }

  /** Reject a `deckId` that does not belong to the team (cross-team FK → 422). */
  private async assertTeamDeck(deckId: string): Promise<void> {
    const deck = await this.scoped.db.deck.findFirst({
      where: { id: deckId },
      select: { id: true },
    });
    if (!deck) {
      throw new UnprocessableEntityException({
        error: {
          code: errorCode.domainRuleViolation,
          message: "The deck does not belong to this team.",
        },
      });
    }
  }
}

function eventNotFound(): NotFoundException {
  return new NotFoundException({
    error: { code: errorCode.notFound, message: "Event not found." },
  });
}

function toDeckSelection(row: DeckSelectionRow): DeckSelection {
  return {
    id: row.id,
    eventId: row.eventId,
    member: {
      userId: row.user.id,
      username: row.user.username ?? "",
      displayName: row.user.displayName,
    },
    deckId: row.deckId,
    deckName: row.deck.name,
    deckFormatId: row.deck.formatId,
    reasoning: row.reasoning,
    locked: row.locked,
    lockedAt: row.lockedAt ? row.lockedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
