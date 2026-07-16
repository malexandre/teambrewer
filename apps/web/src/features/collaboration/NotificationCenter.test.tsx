import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { NotificationCenter } from "./NotificationCenter";

// NotificationCenter deep-links via the router; capture navigate calls with a shared spy.
const navigateSpy = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigateSpy }));

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

const baseNotification = {
  id: "n1",
  type: "mention",
  subjectType: "deck",
  subjectId: "deck-1",
  commentId: "c1",
  actor: { userId: "user-2", username: "bob", displayName: "Bob" },
  readAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
};

const gamePlan = {
  id: "gp-1",
  ourDeckId: "deck-9",
  ourDeckName: "Our Dori",
  formatId: "fmt-cc",
  name: "vs Draconic",
  body: "keep reach",
  metaDeckEntryIds: [],
  updatedBy: { userId: "user-2", username: "bob", displayName: "Bob" },
  archivedAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};

// The notification the list returns; a test swaps it before rendering (reset in beforeEach).
let currentNotification: Record<string, unknown> = baseNotification;

function mockApi(): void {
  let unread = true;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.includes("/api/game-plans/")) return json(gamePlan);
    if (url.includes("/api/notifications/read-all") && method === "POST") {
      unread = false;
      return new Response(null, { status: 204 });
    }
    if (url.includes("/api/notifications") && method === "GET") {
      return json({
        data: [{ ...currentNotification, readAt: unread ? null : "2026-07-12T01:00:00.000Z" }],
        unreadCount: unread ? 1 : 0,
        nextCursor: null,
      });
    }
    return json({}, 404);
  });
}

async function openFirstNotification(): Promise<void> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /notifications/i }));
  await user.click(await screen.findByRole("button", { name: /Bob mentioned you/i }));
}

function renderCenter(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ActiveTeamProvider>
        <NotificationCenter />
      </ActiveTeamProvider>
    </QueryClientProvider>,
  );
}

describe("NotificationCenter", () => {
  beforeEach(() => {
    localStorage.clear();
    currentNotification = baseNotification;
    navigateSpy.mockClear();
    mockApi();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("shows the unread badge and clears it on mark-all-read", async () => {
    renderCenter();
    expect(await screen.findByTestId("notification-badge")).toHaveTextContent("1");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /notifications/i }));
    expect(await screen.findByText(/Bob mentioned you/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /mark all read/i }));
    await waitFor(() => expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument());
  });

  it("deep-links a deck mention to the Activity tab, anchoring the comment", async () => {
    renderCenter();
    await openFirstNotification();
    expect(navigateSpy).toHaveBeenCalledWith({
      to: "/decks/$deckId/$deckTab",
      params: { deckId: "deck-1", deckTab: "activity" },
      hash: "comment-c1",
    });
  });

  it("deep-links a game-log mention to the game page", async () => {
    currentNotification = { ...baseNotification, subjectType: "game_log", subjectId: "game-1" };
    renderCenter();
    await openFirstNotification();
    expect(navigateSpy).toHaveBeenCalledWith({
      to: "/games/$gameLogId",
      params: { gameLogId: "game-1" },
      hash: "comment-c1",
    });
  });

  it("deep-links a task mention to the task dialog", async () => {
    currentNotification = { ...baseNotification, subjectType: "task", subjectId: "task-1" };
    renderCenter();
    await openFirstNotification();
    expect(navigateSpy).toHaveBeenCalledWith({
      to: "/tasks/$taskId",
      params: { taskId: "task-1" },
      hash: "comment-c1",
    });
  });

  it("resolves a game-plan mention's deck, landing on the Plan tab", async () => {
    currentNotification = {
      ...baseNotification,
      subjectType: "matchup_game_plan",
      subjectId: "gp-1",
    };
    renderCenter();
    await openFirstNotification();
    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith({
        to: "/decks/$deckId/$deckTab",
        params: { deckId: "deck-9", deckTab: "plan" },
        hash: "comment-c1",
      }),
    );
  });

  it("omits the hash when a notification carries no comment", async () => {
    currentNotification = { ...baseNotification, commentId: null };
    renderCenter();
    await openFirstNotification();
    expect(navigateSpy).toHaveBeenCalledWith({
      to: "/decks/$deckId/$deckTab",
      params: { deckId: "deck-1", deckTab: "activity" },
    });
    expect(navigateSpy.mock.calls[0]?.[0]).not.toHaveProperty("hash");
  });
});
