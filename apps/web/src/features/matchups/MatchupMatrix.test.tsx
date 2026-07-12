import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MatchupMatrix } from "./MatchupMatrix";

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A matrix with one deck row and two columns; only one column has a cell. */
function mockMatrix() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/matchups/matrix")) {
      return json({
        grouping: "deck",
        formatId: "fmt-cc",
        eventId: null,
        rows: [{ key: "deck:deck-1", deckId: "deck-1", heroId: null, name: "Dori One" }],
        columns: [
          { key: "hero:kano", deckId: null, heroId: "kano", archetypeLabel: null, label: "Kano" },
          {
            key: "archetype:aggro red",
            deckId: null,
            heroId: null,
            archetypeLabel: "Aggro Red",
            label: "Aggro Red",
          },
        ],
        cells: [
          {
            rowKey: "deck:deck-1",
            columnKey: "hero:kano",
            weightedWinRate: 0.5313,
            rawSampleCount: 5,
            effectiveSample: 3.2,
            trustIndicator: "low",
          },
        ],
      });
    }
    return json({}, 404);
  });
}

afterEach(() => vi.restoreAllMocks());

describe("MatchupMatrix", () => {
  it("renders each filled cell with its win rate, raw N, and trust indicator", async () => {
    mockMatrix();
    renderWithClient(<MatchupMatrix teamId="team-a" scope={{ formatId: "fmt-cc" }} />);

    // The Kano cell: 53% · N=5 · low trust, all visible together.
    const kanoCell = await screen.findByText("53%");
    const cell = kanoCell.closest("td");
    expect(cell).not.toBeNull();
    expect(within(cell as HTMLElement).getByText("N=5")).toBeInTheDocument();
    expect(within(cell as HTMLElement).getByText("Low trust")).toBeInTheDocument();
  });

  it("shows an em dash for an untested (row, column) intersection", async () => {
    mockMatrix();
    renderWithClient(<MatchupMatrix teamId="team-a" scope={{ formatId: "fmt-cc" }} />);

    // The Aggro Red column exists but has no cell for our deck → placeholder.
    expect(await screen.findByText("Aggro Red")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("wraps the grid in a horizontally scrollable container for small screens", async () => {
    mockMatrix();
    const { container } = renderWithClient(
      <MatchupMatrix teamId="team-a" scope={{ formatId: "fmt-cc" }} />,
    );
    await screen.findByText("53%");
    expect(container.querySelector(".overflow-x-auto")).not.toBeNull();
  });
});
