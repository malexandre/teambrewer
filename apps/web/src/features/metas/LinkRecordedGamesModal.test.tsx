import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MetaDeckEntry } from "@teambrewer/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LinkRecordedGamesModal } from "./LinkRecordedGamesModal";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ENTRY: MetaDeckEntry = {
  id: "entry-1",
  metaId: "meta-1",
  tier: "meta_defining",
  heroId: "hero-zyggy",
  label: "Zyggy",
  opponentSnapshotLabel: "Zyggy",
  notes: "",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

/** A minimal valid game-log summary whose opponent is a hero + label. */
function candidate(id: string, label: string) {
  return {
    id,
    loggedById: "user-me",
    formatId: "fmt-cc",
    metaId: null,
    playedAt: "2026-07-10T00:00:00.000Z",
    sideA: {
      playerCategory: "teammate",
      deckId: "deck-1",
      metaDeckEntryId: null,
      heroId: null,
      archetypeLabel: null,
    },
    sideB: {
      playerCategory: "other",
      deckId: null,
      metaDeckEntryId: null,
      heroId: "hero-zyggy",
      archetypeLabel: label,
    },
    firstPlayerSide: "A" as const,
    bestOf: 1 as const,
    result: { gamesWonA: 1, gamesWonB: 0 },
    winType: null,
    lossReason: null,
    confidenceWeight: 1,
    archivedAt: null,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  };
}

function renderModal(onClose = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LinkRecordedGamesModal teamId="team-1" metaId="meta-1" entry={ENTRY} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe("LinkRecordedGamesModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists candidates all-selected and links only the ones still checked", async () => {
    const linkBodies: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/link-candidates")) {
        return json({
          data: [candidate("game-a", "Zyggy Aggro"), candidate("game-b", "Zyggy Combo")],
        });
      }
      if (url.includes("/link-games")) {
        linkBodies.push(init?.body ? JSON.parse(init.body as string) : {});
        return json({ linkedCount: 1 }, 201);
      }
      return json({}, 404);
    });
    const user = userEvent.setup();
    const { onClose } = renderModal();

    // Both candidates load, checked by default.
    await screen.findByText("Zyggy Aggro");
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes.every((box) => (box as HTMLInputElement).checked)).toBe(true);

    // Deselect the "Zyggy Combo" game.
    const comboRow = screen.getByText("Zyggy Combo").closest("label") as HTMLElement;
    await user.click(within(comboRow).getByRole("checkbox"));

    await user.click(screen.getByRole("button", { name: /link 1 game/i }));

    expect(linkBodies).toEqual([{ gameLogIds: ["game-a"] }]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when no games match", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/link-candidates")) return json({ data: [] });
      return json({}, 404);
    });
    renderModal();
    expect(await screen.findByText(/no unlinked games match/i)).toBeInTheDocument();
  });
});
