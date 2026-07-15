import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeckCardObservationsSection } from "./DeckCardObservationsSection";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

/** Resolve /card-observations with the given payload (any other request 404s). */
function mockApi(payload: unknown): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/card-observations")) {
      return json(payload);
    }
    return json({}, 404);
  });
}

describe("DeckCardObservationsSection", () => {
  it("renders a row per card with its separate impressive and underperforming counts", async () => {
    mockApi({
      deckId: "deck-1",
      gamesConsidered: 3,
      observations: [
        {
          card: { id: "card-cnc", name: "Command and Conquer", pitch: 1, imageUrl: null },
          impressiveCount: 2,
          underperformingCount: 1,
        },
        {
          card: { id: "card-sink", name: "Sink Below", pitch: 3, imageUrl: null },
          impressiveCount: 0,
          underperformingCount: 4,
        },
      ],
    });

    renderWithClient(<DeckCardObservationsSection teamId="team-1" deckId="deck-1" />);

    // Both cards render, each with both counts shown separately (never netted).
    const cncRow = (await screen.findByText("Command and Conquer")).closest("tr");
    expect(cncRow).not.toBeNull();
    expect(within(cncRow as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(cncRow as HTMLElement).getByText("1")).toBeInTheDocument();

    const sinkRow = screen.getByText("Sink Below").closest("tr");
    expect(within(sinkRow as HTMLElement).getByText("0")).toBeInTheDocument();
    expect(within(sinkRow as HTMLElement).getByText("4")).toBeInTheDocument();

    // The header reflects how many games informed the counts.
    expect(screen.getByText(/3 games/)).toBeInTheDocument();
  });

  it("shows a graceful empty state when no cards have been flagged", async () => {
    mockApi({ deckId: "deck-1", gamesConsidered: 0, observations: [] });

    renderWithClient(<DeckCardObservationsSection teamId="team-1" deckId="deck-1" />);

    expect(await screen.findByText(/No cards flagged yet/)).toBeInTheDocument();
  });
});
