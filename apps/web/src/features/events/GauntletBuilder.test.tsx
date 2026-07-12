import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { GauntletEntry } from "@teambrewer/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GauntletBuilder } from "./GauntletBuilder";

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** Mock the reference-data reads (and optionally the gauntlet-entry create/update) the builder needs. */
function mockApi(
  options: { onCreate?: (body: unknown) => void; onUpdate?: (body: unknown) => void } = {},
) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (/\/api\/events\/event-1\/gauntlet-entries\/[^/]+$/.test(url) && method === "PATCH") {
      const body: { expectedMetaShare?: number } = init?.body
        ? JSON.parse(init.body as string)
        : {};
      options.onUpdate?.(body);
      return json({
        id: "entry-1",
        eventId: "event-1",
        referenceDeckId: null,
        heroId: null,
        archetypeLabel: "Aggro Red",
        expectedMetaShare: body.expectedMetaShare ?? 40,
        notes: "",
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
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
    if (url.includes("/api/decks")) {
      return json({ data: [], nextCursor: null });
    }
    if (url.includes("/api/events/event-1/gauntlet-entries") && method === "POST") {
      const body: unknown = init?.body ? JSON.parse(init.body as string) : {};
      options.onCreate?.(body);
      return json({
        id: "entry-new",
        eventId: "event-1",
        referenceDeckId: null,
        heroId: "hero-dori",
        archetypeLabel: null,
        expectedMetaShare: 25,
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

const entries: GauntletEntry[] = [
  {
    id: "entry-1",
    eventId: "event-1",
    referenceDeckId: null,
    heroId: null,
    archetypeLabel: "Aggro Red",
    expectedMetaShare: 40,
    notes: "",
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  },
  {
    id: "entry-2",
    eventId: "event-1",
    referenceDeckId: null,
    heroId: null,
    archetypeLabel: "Control Blue",
    expectedMetaShare: 30,
    notes: "",
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  },
];

describe("GauntletBuilder", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the running total of expected shares", () => {
    mockApi();
    renderWithClient(
      <GauntletBuilder teamId="team-1" eventId="event-1" entries={entries} canEdit />,
    );
    expect(screen.getByText(/total expected share: 70%/i)).toBeInTheDocument();
  });

  it("validates the expected share is within 0–100 before adding", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithClient(
      <GauntletBuilder teamId="team-1" eventId="event-1" entries={entries} canEdit />,
    );

    // Share is validated before the target, so an out-of-range value is rejected.
    const shareInput = screen.getByLabelText(/expected share/i);
    await user.clear(shareInput);
    await user.type(shareInput, "150");
    await user.click(screen.getByRole("button", { name: /add to gauntlet/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/between 0 and 100/i);
  });

  it("switches the target form and adds a hero entry", async () => {
    const created: unknown[] = [];
    mockApi({ onCreate: (body) => created.push(body) });
    const user = userEvent.setup();
    renderWithClient(
      <GauntletBuilder teamId="team-1" eventId="event-1" entries={entries} canEdit />,
    );

    // Selecting the archetype target reveals the label input (target-form selection).
    await user.selectOptions(screen.getByRole("combobox", { name: /target kind/i }), "archetype");
    expect(screen.getByLabelText(/archetype/i)).toBeInTheDocument();

    // Switch back to a hero and add.
    await user.selectOptions(screen.getByRole("combobox", { name: /target kind/i }), "hero");
    // Wait for the reference-data option to load before selecting it.
    await screen.findByRole("option", { name: "Dorinthea" });
    await user.selectOptions(screen.getByRole("combobox", { name: /^hero$/i }), "hero-dori");
    const shareInput = screen.getByLabelText(/expected share/i);
    await user.clear(shareInput);
    await user.type(shareInput, "25");
    await user.click(screen.getByRole("button", { name: /add to gauntlet/i }));

    await vi.waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ heroId: "hero-dori", expectedMetaShare: 25 });
  });

  it("edits an existing entry's expected share", async () => {
    const updated: unknown[] = [];
    mockApi({ onUpdate: (body) => updated.push(body) });
    const user = userEvent.setup();
    renderWithClient(
      <GauntletBuilder teamId="team-1" eventId="event-1" entries={entries} canEdit />,
    );

    await user.click(screen.getByRole("button", { name: /edit share for aggro red/i }));
    const shareInput = screen.getByLabelText(/expected share for aggro red/i);
    await user.clear(shareInput);
    await user.type(shareInput, "45");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await vi.waitFor(() => expect(updated).toHaveLength(1));
    expect(updated[0]).toMatchObject({ expectedMetaShare: 45 });
  });
});
