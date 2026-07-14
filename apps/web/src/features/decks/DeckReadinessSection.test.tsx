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

/** Resolve /api/heroes and /meta-readiness (any other request 404s). */
function mockApi(readiness: unknown): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/heroes")) {
      return json({ data: [{ id: "hero-dori", name: "Dorinthea", classes: [], talents: [] }] });
    }
    if (url.includes("/meta-readiness")) {
      return json(readiness);
    }
    return json({}, 404);
  });
}

describe("DeckReadinessSection", () => {
  it("renders a readiness row per meta deck with its rate, sample, and plan status", async () => {
    mockApi({
      deckId: "deck-1",
      metaId: "meta-1",
      metaName: "July",
      rows: [
        {
          metaDeckEntryId: "e1",
          tier: "meta_defining",
          heroId: "hero-dori",
          label: "Aggro",
          opponentSnapshotLabel: "Dorinthea · Aggro",
          weightedWinRate: 0.6667,
          rawSampleCount: 4,
          effectiveSample: 3,
          trustIndicator: "low",
          hasGamePlan: false,
        },
        {
          metaDeckEntryId: "e2",
          tier: "contender",
          heroId: null,
          label: "Aggro Red",
          opponentSnapshotLabel: "Aggro Red",
          weightedWinRate: null,
          rawSampleCount: 0,
          effectiveSample: 0,
          trustIndicator: "low",
          hasGamePlan: true,
        },
      ],
    });

    renderWithClient(<DeckReadinessSection teamId="team-1" deckId="deck-1" />);

    // The hero-carrying row leads with the resolved hero name, then the label.
    expect(await screen.findByText("Dorinthea · Aggro")).toBeInTheDocument();
    // The label-only row shows its archetype label alone.
    expect(screen.getByText("Aggro Red")).toBeInTheDocument();
    // 0.6667 → 67% (Win rate column), with the raw sample size in the Games column.
    expect(screen.getByText(/67%/)).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    // A Tier-1 (meta-defining) matchup with no plan surfaces a "Needs a plan" pill;
    // the planned one shows a "✓ Planned" marker.
    expect(screen.getByText("Needs a plan")).toBeInTheDocument();
    expect(screen.getByText("✓ Planned")).toBeInTheDocument();
    // Low-trust rows carry a "thin data" badge (the pastel confidence indicator).
    expect(screen.getAllByText("thin data")).toHaveLength(2);
    // A null rate (no decisive games) renders as an em dash.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows a graceful empty state when no meta is current", async () => {
    mockApi({ deckId: "deck-1", metaId: "", metaName: "", rows: [] });

    renderWithClient(<DeckReadinessSection teamId="team-1" deckId="deck-1" />);

    expect(await screen.findByText(/No current meta/)).toBeInTheDocument();
  });
});
