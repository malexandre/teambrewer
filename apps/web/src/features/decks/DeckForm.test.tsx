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
function mockApi(options: { onCreate?: (body: unknown) => void } = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

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
    if (url.includes("/api/decks/recognize-url") && method === "POST") {
      return json({ recognized: { provider: "fabrary", externalId: "abc" } });
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
        isReference: false,
        tags: [],
        notes: "",
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
});
