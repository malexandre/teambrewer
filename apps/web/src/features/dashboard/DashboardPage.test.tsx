import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardPage } from "./DashboardPage";

/**
 * The active team is read from the ActiveTeamProvider context; stub it so the page
 * renders with a known team id without the full auth/router shell.
 */
vi.mock("@/features/teams/active-team", () => ({
  useActiveTeam: () => ({
    activeTeam: { teamId: "team-1", teamName: "Alpha", role: "member" },
    teams: [],
    setActiveTeam: vi.fn(),
    isPending: false,
  }),
}));

// Router Links render as anchors in tests; a lightweight stub avoids the full router.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => <a {...props}>{children}</a>,
}));

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const EMPTY_ME = { assignments: [], upcomingEvents: [], recentResults: [] };
const EMPTY_TEAM = {
  targetEvent: null,
  minEffectiveSample: 0,
  recommendation: [],
  coverageGaps: [],
  recentResults: [],
  activityHighlights: [],
};

interface MockData {
  me?: unknown;
  team?: unknown;
  events?: unknown;
}

function mockApi(data: MockData = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/dashboard/me")) return json(data.me ?? EMPTY_ME);
    if (url.includes("/api/dashboard/team")) return json(data.team ?? EMPTY_TEAM);
    if (url.includes("/api/events")) return json(data.events ?? { data: [], nextCursor: null });
    return json({}, 404);
  });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("DashboardPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the personal empty states by default", async () => {
    mockApi();
    renderWithClient(<DashboardPage />);

    expect(await screen.findByText("No matchups assigned to you right now.")).toBeInTheDocument();
    expect(screen.getByText("No upcoming events.")).toBeInTheDocument();
    expect(screen.getByText("No games logged yet.")).toBeInTheDocument();
  });

  it("renders my assignments and recent results with outcomes", async () => {
    mockApi({
      me: {
        assignments: [
          {
            id: "a1",
            eventId: "e1",
            assignee: { userId: "u1", username: "me", displayName: "Me" },
            assignedBy: { userId: "u1", username: "me", displayName: "Me" },
            deckId: "d1",
            deckName: "Our Dori",
            opponentGauntletEntryId: null,
            opponentHeroId: null,
            opponentArchetypeLabel: "Aggro Red",
            opponentSnapshotLabel: "vs Aggro Red",
            targetGames: null,
            status: "open",
            notes: "",
            archivedAt: null,
            createdAt: "2026-07-12T00:00:00.000Z",
            updatedAt: "2026-07-12T00:00:00.000Z",
          },
        ],
        upcomingEvents: [],
        recentResults: [
          {
            log: {
              id: "g1",
              loggedById: "u1",
              formatId: "cc",
              eventId: null,
              playedAt: "2026-07-12T00:00:00.000Z",
              sideA: { pilotUserId: "u1", deckId: "d1" },
              sideB: {
                pilotUserId: null,
                externalOpponentName: "Rival Ana",
                deckId: null,
                heroId: null,
                archetypeLabel: null,
              },
              firstPlayerSide: "A",
              bestOf: 1,
              result: { gamesWonA: 1, gamesWonB: 0 },
              winType: null,
              lossReason: null,
              confidenceWeight: 1,
              archivedAt: null,
              createdAt: "2026-07-12T00:00:00.000Z",
              updatedAt: "2026-07-12T00:00:00.000Z",
            },
            outcome: "win",
          },
        ],
      },
    });
    renderWithClient(<DashboardPage />);

    expect(await screen.findByText("vs Aggro Red")).toBeInTheDocument();
    expect(screen.getByText("Win")).toBeInTheDocument();
    expect(screen.getByText("vs Rival Ana")).toBeInTheDocument();
  });

  it("switches to the team scope and shows its empty state", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithClient(<DashboardPage />);

    await user.click(await screen.findByRole("button", { name: /^team$/i }));
    expect(await screen.findByText(/No upcoming event yet\./)).toBeInTheDocument();
  });

  it("ranks what to test next when a target event has a gauntlet", async () => {
    mockApi({
      team: {
        targetEvent: {
          id: "e1",
          name: "Nationals",
          formatId: "cc",
          date: "2026-09-12T00:00:00.000Z",
          location: null,
          importance: "national",
          status: "upcoming",
          archivedAt: null,
          createdAt: "2026-07-12T00:00:00.000Z",
          updatedAt: "2026-07-12T00:00:00.000Z",
        },
        minEffectiveSample: 15,
        recommendation: [
          {
            opponentKey: "hero:kano",
            opponentLabel: "Kano",
            expectedMetaShare: 60,
            normalizedShare: 0.6,
            effectiveSample: 0,
            coverageGap: 1,
            priorityScore: 0.6,
            trustIndicator: "low",
            sharesUnset: false,
            reason: "~60% of the expected field, thinly tested (0/15 effective sample).",
          },
        ],
        coverageGaps: [],
        recentResults: [],
        activityHighlights: [],
      },
    });
    const user = userEvent.setup();
    renderWithClient(<DashboardPage />);

    await user.click(await screen.findByRole("button", { name: /^team$/i }));
    expect(await screen.findByText("Kano")).toBeInTheDocument();
    expect(screen.getByText(/Preparing for/)).toHaveTextContent("Nationals");
  });
});
