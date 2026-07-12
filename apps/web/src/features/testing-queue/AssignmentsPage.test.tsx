import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { AssignmentsPage } from "./AssignmentsPage";

// The card's discussion embeds no router navigation, but the page shell does not
// navigate either; no router stub is needed.

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

const CURRENT_USER = {
  id: "user-1",
  username: "alice",
  displayName: "Alice",
  isInstanceAdmin: false,
  authMethod: "password_totp",
  totpEnabled: true,
  discordUserId: null,
  discordUsername: null,
};

const assignment = (overrides: Record<string, unknown>) => ({
  id: "a1",
  eventId: null,
  assignee: { userId: "user-1", username: "alice", displayName: "Alice" },
  assignedBy: { userId: "user-1", username: "alice", displayName: "Alice" },
  deckId: "deck-1",
  deckName: "Our Kassai",
  opponentGauntletEntryId: null,
  opponentHeroId: "hero-fai",
  opponentArchetypeLabel: null,
  opponentSnapshotLabel: "Fai",
  targetGames: 10,
  status: "open",
  notes: "",
  archivedAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
  ...overrides,
});

/** Records the assignee filter the list requested, so the scope toggle is observable. */
function mockApi(): { assigneeQueries: (string | null)[] } {
  const assigneeQueries: (string | null)[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json(CURRENT_USER);
    if (url.includes("/api/members")) {
      return json({
        data: [
          {
            userId: "user-1",
            username: "alice",
            displayName: "Alice",
            role: "member",
            joinedAt: "2026-07-12T00:00:00.000Z",
          },
        ],
      });
    }
    if (url.includes("/api/decks")) return json({ data: [], nextCursor: null });
    if (url.includes("/api/heroes")) return json({ data: [] });
    if (url.includes("/api/test-assignments")) {
      assigneeQueries.push(new URL(url, "http://x").searchParams.get("assigneeId"));
      return json({
        data: [
          assignment({ id: "a1", opponentSnapshotLabel: "Fai" }),
          assignment({
            id: "a2",
            assignee: { userId: "user-2", username: "bob", displayName: "Bob" },
            opponentSnapshotLabel: "Prism",
          }),
        ],
        nextCursor: null,
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  return { assigneeQueries };
}

function renderPage(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveTeamProvider>{ui}</ActiveTeamProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("AssignmentsPage", () => {
  it("shows the team's assignments with assignee, our deck, opponent, and status", async () => {
    mockApi();
    renderPage(<AssignmentsPage />);

    expect(await screen.findByText("Fai")).toBeInTheDocument();
    expect(screen.getByText("Prism")).toBeInTheDocument();
    expect(screen.getAllByText(/Our Kassai/).length).toBe(2);
    expect(screen.getAllByText(/target 10 games/).length).toBeGreaterThan(0);
    // "open" status badge is present for the assignment.
    expect(screen.getAllByText("Open").length).toBeGreaterThan(0);
  });

  it("narrows to the viewer's assignments when the 'Assigned to me' scope is chosen", async () => {
    const { assigneeQueries } = mockApi();
    renderPage(<AssignmentsPage />);

    await screen.findByText("Fai");
    await userEvent.click(screen.getByRole("button", { name: "Assigned to me" }));

    await waitFor(() => expect(assigneeQueries).toContain("user-1"));
  });

  it("reveals the assignment form when assigning", async () => {
    mockApi();
    renderPage(<AssignmentsPage />);

    await screen.findByText("Fai");
    await userEvent.click(screen.getByRole("button", { name: "Assign a matchup" }));
    expect(screen.getByLabelText("Assignee")).toBeInTheDocument();
    expect(screen.getByLabelText("Our deck")).toBeInTheDocument();
  });
});
