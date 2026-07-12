import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GameLogForm } from "./GameLogForm";

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

/** Mock every reference read the form needs plus the create endpoint. */
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
          bestOf: 3,
          result: { gamesWonA: 2, gamesWonB: 1 },
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

describe("GameLogForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pre-fills the confidence factors and shows the derived-weight hint with zero taps", () => {
    mockApi();
    renderWithClient(<GameLogForm teamId="team-1" onSaved={() => {}} />);
    // All-best defaults → weight 1.00, shown without touching any control.
    expect(screen.getByText(/counts as ~1\.00/i)).toBeInTheDocument();
  });

  it("logs a hero-opponent game with default factors in a few taps", async () => {
    const created: unknown[] = [];
    mockApi({ onCreate: (body) => created.push(body) });
    const user = userEvent.setup();
    const onSaved = vi.fn();
    renderWithClient(<GameLogForm teamId="team-1" onSaved={onSaved} />);

    await screen.findByRole("option", { name: "Classic Constructed" });
    await user.selectOptions(screen.getByLabelText(/^format$/i), "fmt-cc");
    await screen.findByRole("option", { name: "Our Deck" });
    await user.selectOptions(screen.getByLabelText(/your deck/i), "deck-ours");
    await screen.findByRole("option", { name: "Dorinthea" });
    await user.selectOptions(screen.getByRole("combobox", { name: /^hero$/i }), "hero-dori");
    await user.click(screen.getByRole("button", { name: /^log game$/i }));

    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({
      formatId: "fmt-cc",
      sideA: { pilotUserId: "user-me", deckId: "deck-ours" },
      sideB: { heroId: "hero-dori" },
      bestOf: 3,
      result: { gamesWonA: 2, gamesWonB: 1 },
      confidenceFactors: {
        skillParity: "evenly_matched",
        seriousness: "tournament_serious",
        deckMaturity: "both_tuned",
        pilotFamiliarity: "knows_well",
      },
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("reveals the archetype input when the opponent kind is archetype", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithClient(<GameLogForm teamId="team-1" onSaved={() => {}} />);

    await user.selectOptions(screen.getByRole("combobox", { name: /opponent kind/i }), "archetype");
    expect(screen.getByLabelText(/archetype label/i)).toBeInTheDocument();
  });

  it("switches to single-game result buttons and updates the derived weight", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithClient(<GameLogForm teamId="team-1" onSaved={() => {}} />);

    await user.click(screen.getByRole("button", { name: /single game/i }));
    // The Win/Loss/Draw segmented control appears for a best-of-1.
    expect(screen.getByRole("button", { name: /^win$/i })).toBeInTheDocument();

    // Lowering skill parity to a major gap re-derives the weight live.
    await user.click(screen.getByRole("button", { name: /major gap/i }));
    // 0.35*0.4 + 0.25 + 0.25 + 0.15 = 0.79.
    expect(screen.getByText(/counts as ~0\.79/i)).toBeInTheDocument();
  });

  it("blocks a result inconsistent with the best-of", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithClient(<GameLogForm teamId="team-1" onSaved={() => {}} />);

    await screen.findByRole("option", { name: "Classic Constructed" });
    await user.selectOptions(screen.getByLabelText(/^format$/i), "fmt-cc");
    await screen.findByRole("option", { name: "Our Deck" });
    await user.selectOptions(screen.getByLabelText(/your deck/i), "deck-ours");
    await screen.findByRole("option", { name: "Dorinthea" });
    await user.selectOptions(screen.getByRole("combobox", { name: /^hero$/i }), "hero-dori");

    // A best-of-3 cannot be 2–2 (both at the winning threshold).
    const theirGames = screen.getByLabelText(/games they won/i);
    await user.clear(theirGames);
    await user.type(theirGames, "2");
    await user.click(screen.getByRole("button", { name: /^log game$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not consistent with the best-of/i);
  });
});
