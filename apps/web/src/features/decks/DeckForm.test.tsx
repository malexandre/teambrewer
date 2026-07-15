import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeckForm } from "./DeckForm";

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** Mock the reference-data reads (and optionally deck create) the form depends on. */
function mockApi(
  options: { onCreate?: (body: unknown) => void; identityLabel?: string; gameId?: string } = {},
) {
  const gameId = options.gameId ?? "flesh-and-blood";
  const identityLabel = options.identityLabel ?? "Hero";
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.includes("/api/game-config")) {
      return json({ gameId, identityLabel, defaultBestOf: 1 });
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
    if (url.includes("/api/decks/recognize-url") && method === "POST") {
      return json({ recognized: { provider: "fabrary", externalId: "abc" } });
    }
    // The metas list is empty by default → the form links nothing.
    if (url.includes("/api/metas")) {
      return json({ data: [], nextCursor: null });
    }
    if (url.includes("/api/decks") && method === "POST") {
      const body: unknown = init?.body ? JSON.parse(init.body as string) : {};
      options.onCreate?.(body);
      return json({
        id: "deck-1",
        name: "Aggro Dori",
        gameId: "flesh-and-blood",
        formatId: "fmt-cc",
        heroId: null,
        externalUrl: "https://fabrary.net/decks/abc",
        source: "fabrary",
        ownerId: "user-1",
        status: "exploratory",
        visibility: "team",
        tags: [],
        notes: "",
        linkedMetas: [],
        archivedAt: null,
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      });
    }
    return json({}, 404);
  });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("DeckForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validates that a name is required before submitting", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithClient(<DeckForm teamId="team-1" onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /create deck/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/name is required/i);
  });

  it("validates that a format is required once a name is present", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithClient(<DeckForm teamId="team-1" onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText(/name/i), "Aggro Dori");
    await user.click(screen.getByRole("button", { name: /create deck/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/format is required/i);
  });

  it("offers format and hero options drawn from the game's reference data", async () => {
    mockApi();
    renderWithClient(<DeckForm teamId="team-1" onSaved={vi.fn()} />);

    expect(await screen.findByRole("option", { name: "Classic Constructed" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Dorinthea" })).toBeInTheDocument();
  });

  it("labels the identity picker with the game's term — 'Hero' for Flesh and Blood", async () => {
    mockApi({ identityLabel: "Hero", gameId: "flesh-and-blood" });
    renderWithClient(<DeckForm teamId="team-1" onSaved={vi.fn()} />);

    expect(await screen.findByRole("combobox", { name: "Hero" })).toBeInTheDocument();
  });

  it("labels the identity picker with the game's term — 'Legend' for Riftbound", async () => {
    mockApi({ identityLabel: "Legend", gameId: "riftbound" });
    renderWithClient(<DeckForm teamId="team-1" onSaved={vi.fn()} />);

    // The label follows game-config, with no game-specific branching in the UI.
    expect(await screen.findByRole("combobox", { name: "Legend" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Hero" })).not.toBeInTheDocument();
  });

  it("creates a deck from valid input and reports the saved deck", async () => {
    const created: unknown[] = [];
    const onSaved = vi.fn();
    mockApi({ onCreate: (body) => created.push(body) });
    const user = userEvent.setup();
    renderWithClient(<DeckForm teamId="team-1" onSaved={onSaved} />);

    await user.type(screen.getByLabelText(/name/i), "Aggro Dori");
    await user.selectOptions(await screen.findByRole("combobox", { name: /format/i }), "fmt-cc");
    await user.type(screen.getByLabelText(/external deck link/i), "https://fabrary.net/decks/abc");
    await user.click(screen.getByRole("button", { name: /create deck/i }));

    // onSuccess passes (data, variables, ...) — assert on the saved deck itself.
    expect(onSaved.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ id: "deck-1" }));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ name: "Aggro Dori", formatId: "fmt-cc" });
  });

  it("links a per-meta deck entry and submits it as metaEntryLinks", async () => {
    const created: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("/api/game-config"))
        return json({ gameId: "flesh-and-blood", identityLabel: "Hero", defaultBestOf: 1 });
      if (url.includes("/api/formats"))
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
      if (url.includes("/api/heroes")) return json({ data: [] });
      if (url.includes("/deck-entries"))
        return json({
          data: [
            {
              id: "entry-1",
              metaId: "meta-1",
              tier: "meta_defining",
              heroId: null,
              label: "Dash IO",
              opponentSnapshotLabel: "Dash IO",
              notes: "",
              createdAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z",
            },
          ],
        });
      if (url.includes("/api/metas"))
        return json({
          data: [
            {
              id: "meta-1",
              teamId: "team-1",
              formatId: "fmt-cc",
              formatName: "Classic Constructed",
              name: "Summer",
              startDate: "2026-07-01T00:00:00.000Z",
              endDate: "2026-08-01T00:00:00.000Z",
              description: "",
              archivedAt: null,
              createdAt: "2026-07-01T00:00:00.000Z",
              updatedAt: "2026-07-01T00:00:00.000Z",
              changeReason: null,
              changeReasonHeroId: null,
              changeReasonImageUrl: null,
            },
          ],
          nextCursor: null,
        });
      if (url.includes("/api/decks/recognize-url") && method === "POST")
        return json({ recognized: { provider: "fabrary", externalId: "abc" } });
      if (url.includes("/api/decks") && method === "POST") {
        created.push(init?.body ? JSON.parse(init.body as string) : {});
        return json({ id: "deck-1", linkedMetas: [] }, 201);
      }
      return json({}, 404);
    });
    const user = userEvent.setup();
    renderWithClient(<DeckForm teamId="team-1" onSaved={vi.fn()} />);

    await user.type(screen.getByLabelText(/name/i), "Our Dash IO");
    await user.selectOptions(await screen.findByRole("combobox", { name: /format/i }), "fmt-cc");
    await user.type(screen.getByLabelText(/external deck link/i), "https://fabrary.net/decks/abc");
    // The meta is auto-selected (most recent of the format); its entry select appears.
    await user.selectOptions(
      await screen.findByRole("combobox", { name: /this deck's meta deck in summer/i }),
      "entry-1",
    );
    await user.click(screen.getByRole("button", { name: /create deck/i }));

    expect(created[0]?.metaEntryLinks).toEqual([{ metaId: "meta-1", metaDeckEntryId: "entry-1" }]);
  });
});
