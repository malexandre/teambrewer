import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeckReadinessSection } from "./DeckReadinessSection";

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

describe("DeckReadinessSection", () => {
  it("renders a readiness row per meta deck with its rate, sample, and plan status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({
        deckId: "deck-1",
        metaId: "meta-1",
        metaName: "July",
        rows: [
          {
            metaDeckEntryId: "e1",
            tier: "meta_defining",
            opponentSnapshotLabel: "Briar",
            weightedWinRate: 0.6667,
            rawSampleCount: 4,
            effectiveSample: 3,
            trustIndicator: "low",
            hasGamePlan: false,
          },
          {
            metaDeckEntryId: "e2",
            tier: "contender",
            opponentSnapshotLabel: "Aggro Red",
            weightedWinRate: null,
            rawSampleCount: 0,
            effectiveSample: 0,
            trustIndicator: "low",
            hasGamePlan: true,
          },
        ],
      }),
    );

    renderWithClient(<DeckReadinessSection teamId="team-1" deckId="deck-1" />);

    expect(await screen.findByText("Briar")).toBeInTheDocument();
    // 0.6667 → 67%, with the raw sample shown.
    expect(screen.getByText(/67%/)).toBeInTheDocument();
    expect(screen.getByText(/N 4/)).toBeInTheDocument();
    // A Tier-1 matchup with no plan is flagged (plan ✗); the planned one shows plan ✓.
    expect(screen.getByText("plan ✗")).toBeInTheDocument();
    expect(screen.getByText("plan ✓")).toBeInTheDocument();
    // A null rate (no decisive games) renders as an em dash.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a graceful empty state when no meta is current", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ deckId: "deck-1", metaId: "", metaName: "", rows: [] }),
    );

    renderWithClient(<DeckReadinessSection teamId="team-1" deckId="deck-1" />);

    expect(await screen.findByText(/No current meta/)).toBeInTheDocument();
  });
});
