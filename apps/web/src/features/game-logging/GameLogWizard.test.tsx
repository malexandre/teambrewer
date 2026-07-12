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
    if (url.includes("/api/events")) {
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
            isReference: false,
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
          eventId: null,
          playedAt: "2026-07-12T00:00:00.000Z",
          sideA: { pilotUserId: "user-me", deckId: "deck-ours" },
          sideB: {
            pilotUserId: null,
            externalOpponentName: null,
            deckId: null,
            heroId: "hero-dori",
            archetypeLabel: null,
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
    await screen.findByRole("option", { name: "Our Deck" });
    await user.selectOptions(screen.getByLabelText(/your deck/i), "deck-ours");
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
    await screen.findByRole("option", { name: "Our Deck" });
    await user.selectOptions(screen.getByLabelText(/your deck/i), "deck-ours");
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

  it("captures an impressive card and includes it in the create payload", async () => {
    const user = userEvent.setup();
    const created: Array<Record<string, unknown>> = [];
    mockApi({ onCreate: (body) => created.push(body as Record<string, unknown>) });
    renderWithClient(<GameLogWizard teamId="team-1" onSaved={() => {}} />);

    // Step 1 — the matchup.
    await screen.findByRole("option", { name: "Classic Constructed" });
    await user.selectOptions(screen.getByLabelText(/^format$/i), "fmt-cc");
    await screen.findByRole("option", { name: "Our Deck" });
    await user.selectOptions(screen.getByLabelText(/your deck/i), "deck-ours");
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
    const cardOption = await within(impressiveSection).findByRole("button", {
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

  it("seeds from an existing log in edit mode (stored best-of and captured cards)", async () => {
    const user = userEvent.setup();
    mockApi();
    const existingLog: GameLogDetail = {
      id: "game-existing",
      loggedById: "user-me",
      formatId: "fmt-cc",
      eventId: null,
      playedAt: "2026-07-10T00:00:00.000Z",
      sideA: { pilotUserId: "user-me", deckId: "deck-ours" },
      sideB: {
        pilotUserId: null,
        externalOpponentName: null,
        deckId: null,
        heroId: "hero-dori",
        archetypeLabel: null,
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
      learnings: "Watch the on-hit triggers.",
      confidenceFactors: {
        skillParity: "evenly_matched",
        seriousness: "tournament_serious",
        deckMaturity: "both_tuned",
        pilotFamiliarity: "knows_well",
      },
      impressiveCards: [
        {
          card: { id: "card-cnc", name: "Command and Conquer", pitch: 1, imageUrl: null },
          side: "ours",
        },
      ],
      underperformingCards: [],
    };
    renderWithClient(<GameLogWizard teamId="team-1" gameLog={existingLog} onSaved={() => {}} />);

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

    // Step 2 → Step 3 → Step 4: the captured card is seeded and rendered by name.
    await user.click(screen.getByRole("button", { name: /next/i }));
    await user.click(screen.getByRole("button", { name: /add notes & cards/i }));
    const impressiveSection = screen.getByRole("group", { name: /impressive cards/i });
    expect(within(impressiveSection).getByText("Command and Conquer")).toBeInTheDocument();
  });
});
