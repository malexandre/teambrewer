import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GameLogDetail } from "@teambrewer/shared";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GameLogWizard } from "./GameLogWizard";

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

/** Mock every reference read the wizard needs plus the create endpoint. */
function mockApi(options: { onCreate?: (body: unknown) => void } = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.endsWith("/api/me")) {
      return json({
        id: "user-me",
        username: "me",
        displayName: "Me",
        isInstanceAdmin: false,
        authMethod: "password_totp",
        totpEnabled: true,
        discordUserId: null,
        discordUsername: null,
      });
    }
    if (url.includes("/api/game-config")) {
      return json({ gameId: "flesh-and-blood", identityLabel: "Hero", defaultBestOf: 1 });
    }
    if (url.includes("/api/formats")) {
      return json({
        data: [
          {
            id: "fmt-cc",
            gameId: "flesh-and-blood",
            key: "cc",
            name: "Classic Constructed",
            isConstructed: true,
          },
        ],
      });
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
    if (url.includes("/api/cards")) {
      return json({
        data: [{ id: "card-cnc", name: "Command and Conquer", pitch: 1, imageUrl: null }],
        nextCursor: null,
      });
    }
    if (url.includes("/api/members")) {
      return json({
        data: [
          {
            userId: "user-me",
            username: "me",
            displayName: "Me",
            role: "member",
            joinedAt: "2026-07-01T00:00:00.000Z",
          },
          {
            userId: "user-2",
            username: "mate",
            displayName: "Teammate",
            role: "member",
            joinedAt: "2026-07-01T00:00:00.000Z",
          },
        ],
      });
    }
    if (url.includes("/api/metas")) {
      return json({ data: [], nextCursor: null });
    }
    if (url.includes("/api/decks")) {
      return json({
        data: [
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
        ],
        nextCursor: null,
      });
    }
    if (url.endsWith("/api/game-logs") && method === "POST") {
      const body: unknown = init?.body ? JSON.parse(init.body as string) : {};
      options.onCreate?.(body);
      return json(
        {
          id: "game-new",
          loggedById: "user-me",
          formatId: "fmt-cc",
          metaId: null,
          playedAt: "2026-07-12T00:00:00.000Z",
          sideA: {
            playerCategory: "teammate",
            deckId: "deck-ours",
            metaDeckEntryId: null,
            heroId: null,
            archetypeLabel: null,
          },
          sideB: {
            playerCategory: "other",
            deckId: null,
            metaDeckEntryId: null,
            heroId: null,
            archetypeLabel: "Aggro Red",
          },
          firstPlayerSide: "A",
          bestOf: 1,
          result: { gamesWonA: 1, gamesWonB: 0 },
          winType: null,
          lossReason: null,
          confidenceWeight: 1,
          learnings: "",
          confidenceFactors: {
            skillParity: "evenly_matched",
            seriousness: "tournament_serious",
            deckMaturity: "both_tuned",
            pilotFamiliarity: "knows_well",
          },
          impressiveCards: [],
          underperformingCards: [],
          archivedAt: null,
          createdAt: "2026-07-12T00:00:00.000Z",
          updatedAt: "2026-07-12T00:00:00.000Z",
        },
        201,
      );
    }
    return json({}, 404);
  });
}

describe("GameLogWizard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pre-selects the game's default best-of (Bo1 for FaB)", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithClient(<GameLogWizard teamId="team-1" onSaved={() => {}} />);
    // Step 1 → Next → Step 2 shows the result control; Single game is active.
    await screen.findByRole("option", { name: "Classic Constructed" });
    await user.selectOptions(screen.getByLabelText(/^format$/i), "fmt-cc");
    await screen.findAllByRole("option", { name: "Our Deck" });
    await user.selectOptions(screen.getByLabelText(/deck a/i), "deck:deck-ours");
    await screen.findByRole("option", { name: "Dorinthea" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Hero" }), "hero-dori");
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByRole("button", { name: /single game/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("logs a game through the 3-step fast path", async () => {
    const user = userEvent.setup();
    const created: unknown[] = [];
    mockApi({ onCreate: (body) => created.push(body) });
    const onSaved = vi.fn();
    renderWithClient(<GameLogWizard teamId="team-1" onSaved={onSaved} />);
    // step 1
    await screen.findByRole("option", { name: "Classic Constructed" });
    await user.selectOptions(screen.getByLabelText(/^format$/i), "fmt-cc");
    await screen.findAllByRole("option", { name: "Our Deck" });
    await user.selectOptions(screen.getByLabelText(/deck a/i), "deck:deck-ours");
    await screen.findByRole("option", { name: "Dorinthea" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Hero" }), "hero-dori");
    await user.click(screen.getByRole("button", { name: /next/i }));
    // step 2 → Next
    await user.click(screen.getByRole("button", { name: /next/i }));
    // step 3 → Log game
    expect(screen.getByText(/counts as ~1\.00/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^log game$/i }));
    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("blocks Next on step 1 until deck and opponent are chosen", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithClient(<GameLogWizard teamId="team-1" onSaved={() => {}} />);
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("blocks Next when the opponent is missing even though our side is set", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithClient(<GameLogWizard teamId="team-1" onSaved={() => {}} />);
    // Our side is a valid team deck, but the opponent archetype label is empty.
    await screen.findByRole("option", { name: "Classic Constructed" });
    await user.selectOptions(screen.getByLabelText(/^format$/i), "fmt-cc");
    await screen.findAllByRole("option", { name: "Our Deck" });
    await user.selectOptions(screen.getByLabelText("Deck A"), "deck:deck-ours");
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // Still on step 1: the result control has not appeared.
    expect(screen.queryByRole("button", { name: /single game/i })).not.toBeInTheDocument();
  });

  it("goes back a step without losing entered matchup data", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithClient(<GameLogWizard teamId="team-1" onSaved={() => {}} />);
    // Fill step 1 and advance to step 2.
    await screen.findByRole("option", { name: "Classic Constructed" });
    await user.selectOptions(screen.getByLabelText(/^format$/i), "fmt-cc");
    await screen.findAllByRole("option", { name: "Our Deck" });
    await user.selectOptions(screen.getByLabelText("Deck A"), "deck:deck-ours");
    await screen.findByRole("option", { name: "Dorinthea" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Hero" }), "hero-dori");
    await user.click(screen.getByRole("button", { name: /next/i }));
    // Step 2 shows the result control and a Back control.
    await screen.findByRole("button", { name: /single game/i });
    await user.click(screen.getByRole("button", { name: /^back$/i }));
    // Back on step 1, with the previously entered values intact.
    expect(await screen.findByLabelText("Deck A")).toHaveValue("deck:deck-ours");
    expect(screen.getByRole("combobox", { name: "Hero" })).toHaveValue("hero-dori");
  });

  it("captures an impressive card and includes it in the create payload", async () => {
    const user = userEvent.setup();
    const created: Array<Record<string, unknown>> = [];
    mockApi({ onCreate: (body) => created.push(body as Record<string, unknown>) });
    renderWithClient(<GameLogWizard teamId="team-1" onSaved={() => {}} />);

    // Step 1 — the matchup.
    await screen.findByRole("option", { name: "Classic Constructed" });
    await user.selectOptions(screen.getByLabelText(/^format$/i), "fmt-cc");
    await screen.findAllByRole("option", { name: "Our Deck" });
    await user.selectOptions(screen.getByLabelText(/deck a/i), "deck:deck-ours");
    await screen.findByRole("option", { name: "Dorinthea" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Hero" }), "hero-dori");
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 2 → Step 3.
    await user.click(screen.getByRole("button", { name: /next/i }));

    // Step 3 → Step 4 (notes & cards).
    await user.click(screen.getByRole("button", { name: /add notes & cards/i }));

    // Search for a card in the "Impressive cards" section and add it.
    const impressiveSection = screen.getByRole("group", { name: /impressive cards/i });
    const cardSearch = within(impressiveSection).getByRole("combobox", { name: /search cards/i });
    await user.type(cardSearch, "Command");
    const cardOption = await within(impressiveSection).findByRole("option", {
      name: /command and conquer/i,
    });
    await user.click(cardOption);

    // The captured card renders as a list entry (distinct from the search result).
    const capturedEntry = await within(impressiveSection).findByRole("listitem");
    expect(within(capturedEntry).getByText("Command and Conquer")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]?.impressiveCards).toContainEqual({ cardId: "card-cnc", side: "ours" });
  });

  /** A minimal edit-mode log with no notes-triggering fields (so it opens on step 1). */
  function makeExistingLog(overrides: Partial<GameLogDetail> = {}): GameLogDetail {
    return {
      id: "game-existing",
      loggedById: "user-me",
      formatId: "fmt-cc",
      metaId: null,
      playedAt: "2026-07-10T00:00:00.000Z",
      sideA: {
        playerCategory: "teammate",
        deckId: "deck-ours",
        metaDeckEntryId: null,
        heroId: null,
        archetypeLabel: null,
      },
      sideB: {
        playerCategory: "other",
        deckId: null,
        metaDeckEntryId: null,
        heroId: "hero-dori",
        archetypeLabel: "Draconic Dorinthea",
      },
      firstPlayerSide: "A",
      bestOf: 5,
      result: { gamesWonA: 3, gamesWonB: 1 },
      winType: null,
      lossReason: null,
      confidenceWeight: 1,
      archivedAt: null,
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z",
      learnings: "",
      confidenceFactors: {
        skillParity: "evenly_matched",
        seriousness: "tournament_serious",
        deckMaturity: "both_tuned",
        pilotFamiliarity: "knows_well",
      },
      impressiveCards: [],
      underperformingCards: [],
      ...overrides,
    };
  }

  it("seeds the stored best-of in edit mode (wins over the game-config default)", async () => {
    const user = userEvent.setup();
    mockApi();
    renderWithClient(
      <GameLogWizard teamId="team-1" gameLog={makeExistingLog()} onSaved={() => {}} />,
    );

    // Step 1 → Step 2: the stored best-of wins over the game-config default (Bo1).
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByRole("button", { name: /best of 5/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /single game/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("seeds the opponent hero + label subject from an existing log (edit mode)", async () => {
    mockApi();
    renderWithClient(
      <GameLogWizard teamId="team-1" gameLog={makeExistingLog()} onSaved={() => {}} />,
    );
    // Deck B (the opponent side) seeds into hero+label mode with the stored label and hero.
    expect(await screen.findByLabelText(/archetype label/i)).toHaveValue("Draconic Dorinthea");
    await screen.findByRole("option", { name: "Dorinthea" });
    expect(screen.getByRole("combobox", { name: "Hero" })).toHaveValue("hero-dori");
  });

  it("expands the notes step on edit when the log already has a captured card", async () => {
    mockApi();
    const existingLog = makeExistingLog({
      impressiveCards: [
        {
          card: { id: "card-cnc", name: "Command and Conquer", pitch: 1, imageUrl: null },
          side: "ours",
        },
      ],
    });
    renderWithClient(<GameLogWizard teamId="team-1" gameLog={existingLog} onSaved={() => {}} />);

    // The notes step is shown on the initial render — no "Add notes & cards" click —
    // so the already-captured card is visible straight away, and the header reflects it.
    const impressiveSection = await screen.findByRole("group", { name: /impressive cards/i });
    expect(within(impressiveSection).getByText("Command and Conquer")).toBeInTheDocument();
    expect(screen.getByText(/notes & cards/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add notes & cards/i })).not.toBeInTheDocument();
  });
});
