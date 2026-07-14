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
  options: {
    onCreate?: (body: unknown) => void;
    onUpdate?: (body: unknown) => void;
    /** When set, the create endpoint answers this status with a duplicate-style error envelope. */
    createStatus?: number;
    createErrorMessage?: string;
  } = {},
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
        heroId: null,
        label: "Aggro Red",
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
      if (options.createStatus) {
        return json(
          {
            error: {
              code: "conflict",
              message: options.createErrorMessage ?? "That deck is already in this meta.",
            },
          },
          options.createStatus,
        );
      }
      return json({
        id: "entry-new",
        metaId: "meta-1",
        tier: "contender",
        heroId: "hero-dori",
        label: "Draconic Dorinthea",
        opponentSnapshotLabel: "Draconic Dorinthea",
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
    heroId: null,
    label: "Aggro Red",
    opponentSnapshotLabel: "Aggro Red",
    notes: "The deck to beat.",
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  },
  {
    id: "entry-2",
    metaId: "meta-1",
    tier: "fringe",
    heroId: null,
    label: "Control Blue",
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

  it("requires at least a hero or a label before adding", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithClient(
      <MetaDeckEntryBuilder teamId="team-1" metaId="meta-1" entries={entries} canEdit />,
    );

    // Neither a hero nor a label → validation blocks the add.
    await user.click(screen.getByRole("button", { name: /add deck/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/hero or an archetype label/i);
  });

  it("adds a hero-only entry (no label) once a hero is chosen", async () => {
    const created: unknown[] = [];
    mockApi({ onCreate: (body) => created.push(body) });
    const user = userEvent.setup();
    renderWithClient(
      <MetaDeckEntryBuilder teamId="team-1" metaId="meta-1" entries={entries} canEdit />,
    );

    await screen.findByRole("option", { name: "Dorinthea" });
    // Pick a hero, leave the archetype blank → the add is allowed and sends no label.
    await user.selectOptions(screen.getByRole("combobox", { name: /hero/i }), "hero-dori");
    await user.click(screen.getByRole("button", { name: /add deck/i }));

    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ heroId: "hero-dori" });
    expect(created[0]).not.toHaveProperty("label");
  });

  it("adds a label + optional hero entry with the chosen tier", async () => {
    const created: unknown[] = [];
    mockApi({ onCreate: (body) => created.push(body) });
    const user = userEvent.setup();
    renderWithClient(
      <MetaDeckEntryBuilder teamId="team-1" metaId="meta-1" entries={entries} canEdit />,
    );

    await screen.findByRole("option", { name: "Dorinthea" });
    await user.type(screen.getByLabelText(/archetype/i), "Draconic Dorinthea");
    await user.selectOptions(screen.getByRole("combobox", { name: /hero/i }), "hero-dori");
    await user.selectOptions(screen.getByRole("combobox", { name: /^tier$/i }), "contender");
    await user.click(screen.getByRole("button", { name: /add deck/i }));

    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({
      heroId: "hero-dori",
      label: "Draconic Dorinthea",
      tier: "contender",
    });
  });

  it("shows the hero as the heading with the archetype label as a secondary detail", async () => {
    const heroQualified: MetaDeckEntry[] = [
      {
        id: "entry-oscilio",
        metaId: "meta-1",
        tier: "meta_defining",
        heroId: "hero-dori",
        label: "GIAF",
        opponentSnapshotLabel: "Dorinthea (GIAF)",
        notes: "",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      },
    ];
    mockApi();
    renderWithClient(
      <MetaDeckEntryBuilder teamId="team-1" metaId="meta-1" entries={heroQualified} canEdit />,
    );

    // The resolved hero name leads (bold heading, a <p> as opposed to the
    // "Dorinthea" <option> in the add form's hero picker); the archetype label
    // is the smaller, muted secondary line.
    const heroHeading = await screen.findByText("Dorinthea", { selector: "p" });
    expect(heroHeading).toHaveClass("font-medium");
    const archetypeDetail = screen.getByText("GIAF");
    expect(archetypeDetail).toHaveClass("text-muted-foreground");
  });

  it("does not block a second entry sharing a hero, and surfaces the server duplicate error", async () => {
    // A "GIAF" Dorinthea entry already exists; the user adds a second "Spell" one
    // for the same hero. The UI must not block it client-side; only an exact
    // hero+label duplicate is rejected by the server, and that error is surfaced.
    const existing: MetaDeckEntry[] = [
      {
        id: "entry-giaf",
        metaId: "meta-1",
        tier: "meta_defining",
        heroId: "hero-dori",
        label: "GIAF",
        opponentSnapshotLabel: "Dorinthea (GIAF)",
        notes: "",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      },
    ];
    const created: unknown[] = [];
    mockApi({
      onCreate: (body) => created.push(body),
      createStatus: 409,
      createErrorMessage: "That deck is already in this meta.",
    });
    const user = userEvent.setup();
    renderWithClient(
      <MetaDeckEntryBuilder teamId="team-1" metaId="meta-1" entries={existing} canEdit />,
    );

    await screen.findByRole("option", { name: "Dorinthea" });
    await user.type(screen.getByLabelText(/archetype/i), "GIAF");
    await user.selectOptions(screen.getByRole("combobox", { name: /hero/i }), "hero-dori");
    await user.click(screen.getByRole("button", { name: /add deck/i }));

    // The request went out (no client-side block on the shared hero) …
    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ heroId: "hero-dori", label: "GIAF" });
    // … and the server's exact-duplicate error is shown to the user.
    expect(await screen.findByText(/already in this meta/i)).toBeInTheDocument();
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
