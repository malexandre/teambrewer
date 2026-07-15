import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DeckSummary } from "@teambrewer/shared";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildSideAInput, buildSideBInput, emptyMatchupSubjectState } from "./matchup-subject";
import { MatchupSubjectPicker } from "./MatchupSubjectPicker";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Reference reads the picker needs: the game config, heroes, and the meta's entries. */
function mockApi() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/game-config")) {
      return json({ gameId: "flesh-and-blood", identityLabel: "Hero", defaultBestOf: 1 });
    }
    if (url.includes("/api/heroes")) {
      return json({
        data: [
          {
            id: "hero-dori",
            name: "Dorinthea",
            classes: ["Warrior"],
            talents: [],
            startingLife: 20,
            imageUrl: null,
            legalFormatKeys: [],
          },
        ],
      });
    }
    if (url.includes("/deck-entries")) {
      return json({
        data: [
          {
            id: "entry-1",
            metaId: "meta-1",
            tier: "meta_defining",
            heroId: "hero-dori",
            label: "Aggro Red",
            opponentSnapshotLabel: "Dorinthea · Aggro Red",
            notes: "",
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z",
          },
        ],
      });
    }
    return json({}, 404);
  });
}

const DECKS: DeckSummary[] = [
  {
    id: "deck-ours",
    name: "Our Deck",
    gameId: "flesh-and-blood",
    formatId: "fmt-cc",
    heroId: null,
    externalUrl: "https://fabrary.net/decks/x",
    source: "fabrary",
    ownerId: "user-me",
    status: "testing",
    visibility: "team",
    tags: [],
    linkedMetaEntries: [],
    archivedAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
];

/** A controlled harness so the test drives the same state the wizard would own. */
function Harness({ side }: { side: "self" | "opponent" }) {
  const [state, setState] = useState(() =>
    side === "self"
      ? emptyMatchupSubjectState("team_deck", "teammate")
      : emptyMatchupSubjectState("hero_label", "other"),
  );
  return (
    <>
      <MatchupSubjectPicker
        teamId="team-1"
        side={side}
        state={state}
        onChange={setState}
        deckOptions={DECKS}
        metaId="meta-1"
        formatId="fmt-cc"
      />
      <output data-testid="emitted">
        {JSON.stringify(side === "self" ? buildSideAInput(state) : buildSideBInput(state))}
      </output>
    </>
  );
}

function renderHarness(side: "self" | "opponent") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness side={side} />
    </QueryClientProvider>,
  );
}

function emitted(): unknown {
  const text = screen.getByTestId("emitted").textContent ?? "null";
  return JSON.parse(text) as unknown;
}

describe("MatchupSubjectPicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("picking a team deck from the grouped select emits a deckId", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHarness("self");
    await user.selectOptions(screen.getByLabelText("Deck A"), "deck:deck-ours");
    expect(emitted()).toEqual({ deckId: "deck-ours", playerCategory: "teammate" });
  });

  it("picking a meta deck (shown as hero · label) emits a metaDeckEntryId", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHarness("self");
    await screen.findByRole("option", { name: "Dorinthea · Aggro Red" });
    await user.selectOptions(screen.getByLabelText("Deck A"), "meta:entry-1");
    expect(emitted()).toEqual({ metaDeckEntryId: "entry-1", playerCategory: "teammate" });
  });

  it("choosing Other requires a hero and emits it alone (label optional, not pre-filled)", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHarness("opponent");
    await user.selectOptions(screen.getByLabelText("Deck B"), "other");
    // Before a hero is picked the subject is incomplete.
    expect(emitted()).toBeNull();
    await screen.findByRole("option", { name: "Dorinthea" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Hero" }), "hero-dori");
    // Hero alone is a valid subject; the label is not auto-filled.
    expect(emitted()).toEqual({ heroId: "hero-dori", playerCategory: "other" });
  });

  it("attaches the optional label and the player category to a hero subject", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHarness("opponent");
    await user.selectOptions(screen.getByLabelText("Deck B"), "other");
    await screen.findByRole("option", { name: "Dorinthea" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Hero" }), "hero-dori");
    await user.type(screen.getByLabelText(/deck b archetype label/i), "Aggro Red");
    await user.click(screen.getByRole("button", { name: "Circuit player" }));
    expect(emitted()).toEqual({
      heroId: "hero-dori",
      archetypeLabel: "Aggro Red",
      playerCategory: "circuit_player",
    });
  });
});
