import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { SuggestionBoard } from "./SuggestionBoard";

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

/** Two suggestions in different statuses: one the viewer authored + voted, one not. */
const suggestion = (overrides: Record<string, unknown>) => ({
  id: "s1",
  deckId: "deck-1",
  author: { userId: "user-1", username: "alice", displayName: "Alice" },
  cardIn: { id: "card-in", name: "Command and Conquer", pitch: 1, imageUrl: null },
  cardOut: { id: "card-out", name: "Sink Below", pitch: 3, imageUrl: null },
  reasoning: "Improves the go-wide matchup.",
  status: "proposed",
  resolutionNote: "",
  voteCount: 2,
  viewerHasVoted: true,
  archivedAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
  ...overrides,
});

function mockApi(options: { onVote?: (method: string) => void } = {}): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json(CURRENT_USER);
    if (url.includes("/votes/me")) {
      options.onVote?.(method);
      return method === "DELETE" ? new Response(null, { status: 204 }) : json(suggestion({}));
    }
    if (url.includes("/api/card-test-suggestions")) {
      return json({
        data: [
          suggestion({ id: "s1", status: "proposed", viewerHasVoted: true, voteCount: 2 }),
          suggestion({
            id: "s2",
            status: "adopted",
            resolutionNote: "Won the close games.",
            author: { userId: "user-2", username: "bob", displayName: "Bob" },
            cardIn: { id: "card-c", name: "Enlightened Strike", pitch: 1, imageUrl: null },
            cardOut: null,
            viewerHasVoted: false,
            voteCount: 5,
          }),
        ],
        nextCursor: null,
      });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
}

function renderBoard(ui: ReactNode) {
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

describe("SuggestionBoard", () => {
  it("groups suggestions by status with per-status counts", async () => {
    mockApi();
    renderBoard(<SuggestionBoard teamId="team-1" deckId="deck-1" deckArchived={false} />);

    expect(await screen.findByText("Proposed (1)")).toBeInTheDocument();
    expect(screen.getByText("Adopted (1)")).toBeInTheDocument();
    expect(screen.getByText("+Command and Conquer / −Sink Below")).toBeInTheDocument();
    expect(screen.getByText(/Won the close games\./)).toBeInTheDocument();
  });

  it("reflects the current user's vote on the vote control", async () => {
    mockApi();
    renderBoard(<SuggestionBoard teamId="team-1" deckId="deck-1" deckArchived={false} />);

    const retract = await screen.findByRole("button", { name: "Retract upvote" });
    expect(retract).toHaveAttribute("aria-pressed", "true");
    const upvote = screen.getByRole("button", { name: "Upvote" });
    expect(upvote).toHaveAttribute("aria-pressed", "false");
  });

  it("only shows the status control on a suggestion the viewer may modify", async () => {
    mockApi();
    renderBoard(<SuggestionBoard teamId="team-1" deckId="deck-1" deckArchived={false} />);

    // The viewer authored s1 (proposed) but not s2 (adopted, by Bob); as a plain
    // member only their own suggestion exposes a status control.
    await screen.findByText("Proposed (1)");
    const statusControls = screen.getAllByLabelText("Change status");
    expect(statusControls).toHaveLength(1);
  });

  it("retracts the viewer's vote when the pressed control is tapped", async () => {
    const votes: string[] = [];
    mockApi({ onVote: (method) => votes.push(method) });
    renderBoard(<SuggestionBoard teamId="team-1" deckId="deck-1" deckArchived={false} />);

    const retract = await screen.findByRole("button", { name: "Retract upvote" });
    await userEvent.click(retract);
    await waitFor(() => expect(votes).toContain("DELETE"));
  });

  it("hides the propose action when the deck is archived", async () => {
    mockApi();
    renderBoard(<SuggestionBoard teamId="team-1" deckId="deck-1" deckArchived />);

    await screen.findByText("Proposed (1)");
    expect(screen.queryByRole("button", { name: "Propose a card test" })).not.toBeInTheDocument();
  });

  it("reveals the suggestion form when proposing", async () => {
    mockApi();
    renderBoard(<SuggestionBoard teamId="team-1" deckId="deck-1" deckArchived={false} />);

    await screen.findByText("Proposed (1)");
    await userEvent.click(screen.getByRole("button", { name: "Propose a card test" }));
    expect(screen.getByText("Card to test")).toBeInTheDocument();
    const form = screen.getByText("Card to test").closest("form");
    expect(form).not.toBeNull();
    expect(
      within(form as HTMLElement).getByRole("button", { name: "Propose" }),
    ).toBeInTheDocument();
  });
});
