import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { GameLogDetail } from "@teambrewer/shared";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { GameDetail } from "./GameDetail";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const TEAM = {
  teamId: "team-1",
  name: "Alpha",
  slug: "alpha",
  gameId: "flesh-and-blood",
  role: "member" as const,
};

const game: GameLogDetail = {
  id: "game-1",
  loggedById: "user-1",
  formatId: "fmt-cc",
  metaId: null,
  playedAt: "2026-07-10T00:00:00.000Z",
  sideA: {
    playerCategory: "teammate",
    deckId: null,
    metaDeckEntryId: null,
    heroId: "hero-dori",
    archetypeLabel: null,
  },
  sideB: {
    playerCategory: "other",
    deckId: null,
    metaDeckEntryId: null,
    heroId: "hero-dori",
    archetypeLabel: "Draconic",
  },
  firstPlayerSide: "A",
  bestOf: 1,
  result: { gamesWonA: 1, gamesWonB: 0 },
  winType: null,
  lossReason: null,
  confidenceWeight: 1,
  archivedAt: null,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
  learnings: "",
  confidenceFactors: {
    skillParity: "evenly_matched",
    seriousness: "tournament_serious",
    deckMaturity: "both_tuned",
    pilotFamiliarity: "knows_well",
  },
  impressiveCards: [],
  underperformingCards: [],
};

function mockApi(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me"))
      return json({
        id: "user-1",
        username: "alice",
        displayName: "Alice",
        isInstanceAdmin: false,
        authMethod: "password_totp",
        totpEnabled: true,
        discordUserId: null,
        discordUsername: null,
      });
    if (url.includes("/api/members")) {
      return json({
        data: [
          {
            userId: "user-1",
            username: "alice",
            displayName: "Alice",
            role: "member",
            joinedAt: "x",
          },
          { userId: "user-2", username: "bob", displayName: "Bob", role: "member", joinedAt: "x" },
        ],
      });
    }
    if (url.includes("/api/heroes")) {
      return json({ data: [{ id: "hero-dori", name: "Dorinthea", classes: [], talents: [] }] });
    }
    if (url.includes("/api/decks")) return json({ data: [], nextCursor: null });
    if (url.includes("/api/metas")) return json({ data: [], nextCursor: null });
    if (url.includes("/api/comments") && method === "GET") {
      return json({
        data: [
          {
            id: "g1",
            subjectType: "game_log",
            subjectId: "game-1",
            author: { userId: "user-2", username: "bob", displayName: "Bob" },
            body: "great topdeck there",
            parentCommentId: null,
            archivedAt: null,
            createdAt: "2026-07-10T00:00:00.000Z",
            updatedAt: "2026-07-10T00:00:00.000Z",
            replies: [],
          },
        ],
      });
    }
    if (url.includes("/api/activity")) return json({ data: [], nextCursor: null });
    return json({}, 404);
  });
}

function renderDetail(initialEntry: string): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const gameRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/games/$gameLogId",
    component: () => (
      <ActiveTeamProvider>
        <GameDetail teamId="team-1" game={game} />
      </ActiveTeamProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([gameRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("GameDetail", () => {
  it("scrolls to and highlights the comment named in the #comment hash", async () => {
    mockApi();
    renderDetail("/games/game-1#comment-g1");

    await screen.findByText("great topdeck there");
    await waitFor(() =>
      expect(document.getElementById("comment-g1")?.className).toContain("ring-primary"),
    );
  });

  it("leaves comments un-highlighted without a hash", async () => {
    mockApi();
    renderDetail("/games/game-1");

    await screen.findByText("great topdeck there");
    expect(document.getElementById("comment-g1")?.className).not.toContain("ring-primary");
  });
});
