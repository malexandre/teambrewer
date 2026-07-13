import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeckCardIdeasSection } from "./DeckCardIdeasSection";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockApi(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/tasks")) {
      return json({
        data: [
          {
            id: "task-1",
            title: "Test Bravado",
            description: "",
            deckId: "deck-1",
            deckName: "Aggro Dori",
            author: { userId: "u1", username: "alice", displayName: "Alice" },
            assignee: null,
            status: "proposed",
            report: "",
            voteCount: 0,
            viewerHasVoted: false,
            archivedAt: null,
            createdAt: "2026-07-12T00:00:00.000Z",
            updatedAt: "2026-07-12T00:00:00.000Z",
          },
        ],
        nextCursor: null,
      });
    }
    if (url.includes("/api/members")) return json({ data: [] });
    if (url.includes("/api/decks")) return json({ data: [], nextCursor: null });
    throw new Error(`Unexpected request: ${url}`);
  });
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DeckCardIdeasSection", () => {
  it("lists the deck's tasks", async () => {
    mockApi();
    renderWithClient(
      <DeckCardIdeasSection teamId="team-1" deckId="deck-1" deckName="Aggro Dori" />,
    );

    expect(await screen.findByText("Test Bravado")).toBeInTheDocument();
    expect(screen.getByText("Proposed")).toBeInTheDocument();
  });

  it("opens the shared task form pre-seeded with a card-idea title for this deck", async () => {
    mockApi();
    renderWithClient(
      <DeckCardIdeasSection teamId="team-1" deckId="deck-1" deckName="Aggro Dori" />,
    );

    await screen.findByText("Test Bravado");
    await userEvent.click(screen.getByRole("button", { name: "Add card idea" }));

    // The reused tasks form appears with the seeded title (pre-linked to this deck).
    expect(screen.getByLabelText("Task title")).toHaveValue("Card idea: Aggro Dori");
    expect(screen.getByLabelText("Task description")).toBeInTheDocument();
  });
});
