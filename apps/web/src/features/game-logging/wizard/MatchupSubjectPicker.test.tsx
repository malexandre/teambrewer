import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DeckSummary, TeamMember } from "@teambrewer/shared";
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
            heroId: null,
            label: "Aggro Red",
            opponentSnapshotLabel: "Aggro Red",
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
    archivedAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  },
];

const MEMBERS: TeamMember[] = [
  {
    userId: "mate-1",
    username: "mate",
    displayName: "Teammate",
    role: "member",
    joinedAt: "2026-07-01T00:00:00.000Z",
  },
];

/** A controlled harness so the test drives the same state the wizard would own. */
function Harness({ side }: { side: "self" | "opponent" }) {
  const [state, setState] = useState(() =>
    emptyMatchupSubjectState(side === "self" ? "team_deck" : "hero_label"),
  );
  return (
    <>
      <MatchupSubjectPicker
        teamId="team-1"
        side={side}
        state={state}
        onChange={setState}
        deckOptions={DECKS}
        memberOptions={MEMBERS}
        metaId="meta-1"
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

  it("team-deck mode emits a deckId", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHarness("self");
    await user.selectOptions(screen.getByLabelText("Your deck"), "deck-ours");
    expect(emitted()).toEqual({ deckId: "deck-ours" });
  });

  it("meta-deck mode emits a metaDeckEntryId", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHarness("self");
    await user.click(screen.getByRole("button", { name: "Meta deck" }));
    await screen.findByRole("option", { name: /Aggro Red · Meta-defining/ });
    await user.selectOptions(screen.getByLabelText("Your meta deck"), "entry-1");
    expect(emitted()).toEqual({ metaDeckEntryId: "entry-1" });
  });

  it("hero+label mode auto-fills the label from the selected hero", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHarness("opponent");
    await screen.findByRole("option", { name: "Dorinthea" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Hero" }), "hero-dori");
    expect(emitted()).toEqual({ archetypeLabel: "Dorinthea", heroId: "hero-dori" });
  });

  it("attaches an opponent teammate pilot without forcing a team deck", async () => {
    const user = userEvent.setup();
    mockApi();
    renderHarness("opponent");
    await user.type(screen.getByLabelText("Opponent archetype label"), "Aggro Red");
    await user.selectOptions(screen.getByLabelText(/teammate who piloted it/i), "mate-1");
    expect(emitted()).toEqual({ archetypeLabel: "Aggro Red", pilotUserId: "mate-1" });
  });
});
