import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MetaDeckEntry } from "@teambrewer/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MetaDeckEntryBuilder } from "./MetaDeckEntryBuilder";

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** Mock the reference-data reads (and optionally the deck-entry create/update) the builder needs. */
function mockApi(
  options: { onCreate?: (body: unknown) => void; onUpdate?: (body: unknown) => void } = {},
) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (/\/api\/metas\/meta-1\/deck-entries\/[^/]+$/.test(url) && method === "PATCH") {
      const body: unknown = init?.body ? JSON.parse(init.body as string) : {};
      options.onUpdate?.(body);
      return json({
        id: "entry-1",
        metaId: "meta-1",
        tier: "meta_defining",
        referenceDeckId: null,
        heroId: null,
        archetypeLabel: "Aggro Red",
        opponentSnapshotLabel: "Aggro Red",
        notes: "Now the top deck.",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      });
    }
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
          },
        ],
      });
    }
    if (url.includes("/api/decks")) {
      return json({ data: [], nextCursor: null });
    }
    if (url.includes("/api/metas/meta-1/deck-entries") && method === "POST") {
      const body: unknown = init?.body ? JSON.parse(init.body as string) : {};
      options.onCreate?.(body);
      return json({
        id: "entry-new",
        metaId: "meta-1",
        tier: "contender",
        referenceDeckId: null,
        heroId: "hero-dori",
        archetypeLabel: null,
        opponentSnapshotLabel: "Dorinthea",
        notes: "",
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

const entries: MetaDeckEntry[] = [
  {
    id: "entry-1",
    metaId: "meta-1",
    tier: "meta_defining",
    referenceDeckId: null,
    heroId: null,
    archetypeLabel: "Aggro Red",
    opponentSnapshotLabel: "Aggro Red",
    notes: "The deck to beat.",
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  },
  {
    id: "entry-2",
    metaId: "meta-1",
    tier: "fringe",
    referenceDeckId: null,
    heroId: null,
    archetypeLabel: "Control Blue",
    opponentSnapshotLabel: "Control Blue",
    notes: "",
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  },
];

describe("MetaDeckEntryBuilder", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("groups entries by tier with the tier labels", () => {
    mockApi();
    renderWithClient(
      <MetaDeckEntryBuilder teamId="team-1" metaId="meta-1" entries={entries} canEdit />,
    );
    expect(screen.getByRole("heading", { name: "Meta-defining" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /fringe/i })).toBeInTheDocument();
    expect(screen.getByText("Aggro Red")).toBeInTheDocument();
    expect(screen.getByText("The deck to beat.")).toBeInTheDocument();
  });

  it("validates a target is chosen before adding", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithClient(
      <MetaDeckEntryBuilder teamId="team-1" metaId="meta-1" entries={entries} canEdit />,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /target kind/i }), "archetype");
    // Archetype label left blank → validation blocks the add.
    await user.click(screen.getByRole("button", { name: /add deck/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/archetype label/i);
  });

  it("adds a hero entry with the chosen tier", async () => {
    const created: unknown[] = [];
    mockApi({ onCreate: (body) => created.push(body) });
    const user = userEvent.setup();
    renderWithClient(
      <MetaDeckEntryBuilder teamId="team-1" metaId="meta-1" entries={entries} canEdit />,
    );

    await screen.findByRole("option", { name: "Dorinthea" });
    await user.selectOptions(screen.getByRole("combobox", { name: /^hero$/i }), "hero-dori");
    await user.selectOptions(screen.getByRole("combobox", { name: /^tier$/i }), "contender");
    await user.click(screen.getByRole("button", { name: /add deck/i }));

    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ heroId: "hero-dori", tier: "contender" });
  });

  it("edits an existing entry's tier and notes", async () => {
    const updated: unknown[] = [];
    mockApi({ onUpdate: (body) => updated.push(body) });
    const user = userEvent.setup();
    renderWithClient(
      <MetaDeckEntryBuilder teamId="team-1" metaId="meta-1" entries={entries} canEdit />,
    );

    await user.click(screen.getByRole("button", { name: /edit aggro red/i }));
    const notes = screen.getByLabelText(/notes for aggro red/i);
    await user.clear(notes);
    await user.type(notes, "Now the top deck.");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await vi.waitFor(() => expect(updated).toHaveLength(1));
    expect(updated[0]).toMatchObject({ notes: "Now the top deck." });
  });
});
