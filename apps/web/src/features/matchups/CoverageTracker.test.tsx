import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CoverageTracker } from "./CoverageTracker";

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

/**
 * The Kano matchup has an effective sample of 4.2, so the threshold decides whether
 * it reads as under-covered: flagged at the default 15, covered once the threshold
 * drops to 2. The mock reflects that from the `minEffectiveSample` query param.
 */
function mockCoverage() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/matchups/coverage")) {
      const minEffectiveSample = Number(
        new URL(url, "http://x").searchParams.get("minEffectiveSample"),
      );
      return json({
        grouping: "deck",
        eventId: "event-1",
        formatId: "fmt-cc",
        minEffectiveSample,
        rows: [
          {
            gauntletEntryId: "gauntlet-kano",
            opponent: {
              key: "hero:kano",
              deckId: null,
              heroId: "kano",
              archetypeLabel: null,
              label: "Kano",
            },
            expectedMetaShare: 30,
            normalizedShare: 0.3,
            aggregate: {
              weightedWinRate: 0.6429,
              rawSampleCount: 7,
              effectiveSample: 4.2,
              trustIndicator: "low",
            },
            isUnderCovered: 4.2 < minEffectiveSample,
            candidates: [],
            assignments: [],
          },
        ],
      });
    }
    return json({}, 404);
  });
}

afterEach(() => vi.restoreAllMocks());

describe("CoverageTracker", () => {
  it("flags a thin matchup as under-tested at the default threshold", async () => {
    mockCoverage();
    renderWithClient(<CoverageTracker teamId="team-a" eventId="event-1" byHero={false} />);

    expect(await screen.findByText("Kano")).toBeInTheDocument();
    expect(screen.getByText(/under-tested/)).toBeInTheDocument();
  });

  it("re-flags rows when the threshold control changes", async () => {
    mockCoverage();
    const user = userEvent.setup();
    renderWithClient(<CoverageTracker teamId="team-a" eventId="event-1" byHero={false} />);

    await screen.findByText(/under-tested/);
    // Dropping the threshold to 2 clears the flag (effective sample 4.2 now suffices).
    await user.selectOptions(screen.getByRole("combobox", { name: /coverage threshold/i }), "2");
    await vi.waitFor(() => {
      expect(screen.queryByText(/under-tested/)).not.toBeInTheDocument();
    });
  });
});
