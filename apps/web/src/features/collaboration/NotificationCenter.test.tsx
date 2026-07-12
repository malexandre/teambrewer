import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { NotificationCenter } from "./NotificationCenter";

// NotificationCenter deep-links via the router; stub navigation for the unit test.
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

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

const notification = {
  id: "n1",
  type: "mention",
  subjectType: "deck",
  subjectId: "deck-1",
  commentId: "c1",
  actor: { userId: "user-2", username: "bob", displayName: "Bob" },
  readAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
};

/** A stateful mock: unread starts at 1 and drops to 0 after read-all. */
function mockApi(): void {
  let unread = true;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.includes("/api/notifications/read-all") && method === "POST") {
      unread = false;
      return new Response(null, { status: 204 });
    }
    if (url.includes("/api/notifications") && method === "GET") {
      return json({
        data: [{ ...notification, readAt: unread ? null : "2026-07-12T01:00:00.000Z" }],
        unreadCount: unread ? 1 : 0,
        nextCursor: null,
      });
    }
    return json({}, 404);
  });
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
});
