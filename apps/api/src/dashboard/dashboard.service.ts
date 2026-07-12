import { Injectable } from "@nestjs/common";

import {
  type DashboardCoverageGap,
  type DashboardMeResponse,
  type DashboardRecentResult,
  type DashboardTeamQuery,
  type DashboardTeamResponse,
  type DashboardUpcomingEvent,
  type EventSummary,
  type GameLogSummary,
  type GameOutcome,
  type MatchupCoverageRow,
  type TestAssignment,
  type TestingPriorityMatchup,
  deriveGameOutcome,
  rankTestingPriorities,
} from "@teambrewer/shared";

import { CollaborationActivityService } from "../collaboration/activity.service.js";
import { DeckSelectionsService } from "../events/deck-selections.service.js";
import { EventsService } from "../events/events.service.js";
import { GameLogsService } from "../game-logs/game-logs.service.js";
import { MatchupsService } from "../matchups/matchups.service.js";
import { TestAssignmentsService } from "../testing-queue/test-assignments.service.js";
import type { TeamContext } from "../tenancy/team-context.js";

/** How many recent games each results widget surfaces. */
const RECENT_RESULTS_LIMIT = 10;
/** How many nearest-upcoming events the personal view surfaces. */
const UPCOMING_EVENTS_LIMIT = 5;
/** How many team activity entries the team view surfaces. */
const ACTIVITY_HIGHLIGHTS_LIMIT = 8;
/** A generous page for the composed reads the dashboard filters down itself. */
const COMPOSE_PAGE_LIMIT = 50;
/** The assignment statuses that still count as "on my plate". */
const ACTIVE_ASSIGNMENT_STATUSES = ["open", "in_progress"] as const;

/**
 * The dashboard: a read-only aggregation surface (docs/features/dashboard.md,
 * phase-11) that answers "what should I do next?" It owns no persisted data — it
 * **composes the existing per-module services**, so every read is filtered by the
 * verified `teamId` exactly as those services enforce (a cross-tenant `eventId`
 * yields a 404 there, never leaking another team's aggregates). Personal slices are
 * additionally filtered by the caller's `userId`. The only real logic — the
 * "what to test next" ranking — lives in `packages/shared`
 * ({@link rankTestingPriorities}); this service just shapes inputs and calls it.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly matchups: MatchupsService,
    private readonly events: EventsService,
    private readonly deckSelections: DeckSelectionsService,
    private readonly gameLogs: GameLogsService,
    private readonly testAssignments: TestAssignmentsService,
    private readonly activity: CollaborationActivityService,
  ) {}

  /** The caller's personal overview for the active team. */
  async me(team: TeamContext): Promise<DashboardMeResponse> {
    const [assignments, upcomingEvents, recentResults] = await Promise.all([
      this.myActiveAssignments(team.userId),
      this.myUpcomingEvents(team.userId),
      this.myRecentResults(team.userId),
    ]);
    return { assignments, upcomingEvents, recentResults };
  }

  /** The active team's overview for a target event (explicit, else nearest upcoming). */
  async team(team: TeamContext, query: DashboardTeamQuery): Promise<DashboardTeamResponse> {
    const targetEvent = await this.resolveTargetEvent(query.eventId);

    const [coverage, recentResults, activityHighlights] = await Promise.all([
      this.eventCoverage(targetEvent),
      this.teamRecentResults(),
      this.activityHighlights(team),
    ]);

    return {
      targetEvent,
      minEffectiveSample: coverage.minEffectiveSample,
      recommendation: coverage.recommendation,
      coverageGaps: coverage.coverageGaps,
      recentResults,
      activityHighlights,
    };
  }

  // --- Personal slices ------------------------------------------------------

  /** My open + in-progress test assignments, newest first. */
  private async myActiveAssignments(userId: string): Promise<TestAssignment[]> {
    const pages = await Promise.all(
      ACTIVE_ASSIGNMENT_STATUSES.map((status) =>
        this.testAssignments.list({ assigneeId: userId, status, limit: COMPOSE_PAGE_LIMIT }),
      ),
    );
    return pages
      .flatMap((page) => page.data)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }

  /** The nearest upcoming events with my RSVP + deck selection (null when unset). */
  private async myUpcomingEvents(userId: string): Promise<DashboardUpcomingEvent[]> {
    const upcoming = await this.nearestUpcomingEvents(UPCOMING_EVENTS_LIMIT);

    return Promise.all(
      upcoming.map(async (event): Promise<DashboardUpcomingEvent> => {
        const [attendance, selections] = await Promise.all([
          this.events.listAttendance(event.id),
          this.deckSelections.listForEvent(event.id),
        ]);
        const myAttendance = attendance.data.find((row) => row.user.userId === userId);
        const myDeckSelection = selections.data.find((row) => row.member.userId === userId);
        return {
          event,
          myAttendance: myAttendance?.status ?? null,
          myDeckSelection: myDeckSelection ?? null,
        };
      }),
    );
  }

  /** My recent games, with the outcome from my perspective (flipped when I piloted side B). */
  private async myRecentResults(userId: string): Promise<DashboardRecentResult[]> {
    const logs = await this.gameLogs.list({ pilotUserId: userId, limit: RECENT_RESULTS_LIMIT });
    return logs.data.map((log) => ({ log, outcome: outcomeForUser(log, userId) }));
  }

  // --- Team slices ----------------------------------------------------------

  /**
   * The recommendation + coverage gaps for the target event. Composes the coverage
   * aggregation (matchups) and overlays the current test assignees; returns empty
   * structures (and the default target) when there is no upcoming event.
   */
  private async eventCoverage(targetEvent: EventSummary | null): Promise<{
    minEffectiveSample: number;
    recommendation: DashboardTeamResponse["recommendation"];
    coverageGaps: DashboardCoverageGap[];
  }> {
    if (!targetEvent) {
      return { minEffectiveSample: 0, recommendation: [], coverageGaps: [] };
    }

    const [coverage, assignments] = await Promise.all([
      this.matchups.coverage({ eventId: targetEvent.id, byHero: false }),
      this.testAssignments.list({ eventId: targetEvent.id, limit: COMPOSE_PAGE_LIMIT }),
    ]);

    const activeAssignments = assignments.data.filter((assignment) =>
      (ACTIVE_ASSIGNMENT_STATUSES as readonly string[]).includes(assignment.status),
    );

    const matchups: TestingPriorityMatchup[] = coverage.rows.map((row) => ({
      opponentKey: row.opponent.key,
      opponentLabel: row.opponent.label,
      expectedMetaShare: row.expectedMetaShare,
      effectiveSample: row.aggregate.effectiveSample,
      trustIndicator: row.aggregate.trustIndicator,
    }));

    const coverageGaps: DashboardCoverageGap[] = coverage.rows
      .filter((row) => row.isUnderCovered)
      .map((row) => ({
        gauntletEntryId: row.gauntletEntryId,
        opponent: row.opponent,
        expectedMetaShare: row.expectedMetaShare,
        normalizedShare: row.normalizedShare,
        aggregate: row.aggregate,
        isUnderCovered: row.isUnderCovered,
        assignees: assigneesForRow(row, activeAssignments),
      }));

    return {
      minEffectiveSample: coverage.minEffectiveSample,
      recommendation: rankTestingPriorities({
        matchups,
        targetEffectiveSample: coverage.minEffectiveSample,
      }),
      coverageGaps,
    };
  }

  /** The team's recent games, outcome from our side (side A). */
  private async teamRecentResults(): Promise<DashboardRecentResult[]> {
    const logs = await this.gameLogs.list({ limit: RECENT_RESULTS_LIMIT });
    return logs.data.map((log) => ({
      log,
      outcome: deriveGameOutcome(log.result),
    }));
  }

  /** A small, newest-first slice of the team activity feed. */
  private async activityHighlights(
    team: TeamContext,
  ): Promise<DashboardTeamResponse["activityHighlights"]> {
    const feed = await this.activity.list(team, { limit: ACTIVITY_HIGHLIGHTS_LIMIT });
    return feed.data;
  }

  // --- Shared helpers -------------------------------------------------------

  /** Resolve the target event: an explicit id (404 if cross-tenant), else nearest upcoming. */
  private async resolveTargetEvent(eventId: string | undefined): Promise<EventSummary | null> {
    if (eventId) {
      // getEvent is team-scoped: a cross-tenant / missing id throws 404 (no leak).
      const detail = await this.events.getEvent(eventId);
      return {
        id: detail.id,
        name: detail.name,
        formatId: detail.formatId,
        date: detail.date,
        location: detail.location,
        importance: detail.importance,
        status: detail.status,
        archivedAt: detail.archivedAt,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
      };
    }
    const [nearest] = await this.nearestUpcomingEvents(1);
    return nearest ?? null;
  }

  /** The soonest-dated upcoming events (the list is date-descending, so re-sort ascending). */
  private async nearestUpcomingEvents(limit: number): Promise<EventSummary[]> {
    const upcoming = await this.events.list({ status: "upcoming", limit: COMPOSE_PAGE_LIMIT });
    return [...upcoming.data]
      .sort((first, second) => Date.parse(first.date) - Date.parse(second.date))
      .slice(0, limit);
  }
}

/** A game's outcome from a specific user's perspective (flip when they piloted side B). */
function outcomeForUser(log: GameLogSummary, userId: string): GameOutcome {
  const outcome = deriveGameOutcome(log.result);
  if (log.sideB.pilotUserId === userId && log.sideA.pilotUserId !== userId) {
    return outcome === "win" ? "loss" : outcome === "loss" ? "win" : "draw";
  }
  return outcome;
}

/** Display names of the members assigned to test a gauntlet target. */
function assigneesForRow(row: MatchupCoverageRow, assignments: TestAssignment[]): string[] {
  const matches = assignments.filter((assignment) => {
    if (assignment.opponentGauntletEntryId === row.gauntletEntryId) return true;
    if (assignment.opponentHeroId && assignment.opponentHeroId === row.opponent.heroId) return true;
    return Boolean(
      assignment.opponentArchetypeLabel &&
      row.opponent.archetypeLabel &&
      assignment.opponentArchetypeLabel.toLowerCase() === row.opponent.archetypeLabel.toLowerCase(),
    );
  });
  return [...new Set(matches.map((assignment) => assignment.assignee.displayName))];
}
