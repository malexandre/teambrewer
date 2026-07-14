import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { DeckDetail as DeckDetailType } from "@teambrewer/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { DeckDetail } from "./DeckDetail";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const TEAM = {
  teamId: "team-1",
  name: "Alpha",
  slug: "alpha",
  gameId: "flesh-and-blood",
  role: "member" as const,
};

const USER = {
  id: "user-1",
  username: "alice",
  displayName: "Alice",
  isInstanceAdmin: false,
  authMethod: "password_totp",
  totpEnabled: true,
  discordUserId: null,
  discordUsername: null,
};

const deck: DeckDetailType = {
  id: "deck-1",
  name: "Aggro Dorinthea",
  gameId: "flesh-and-blood",
  formatId: "fmt-cc",
  heroId: "hero-dori",
  externalUrl: "https://fabrary.net/decks/abc",
  source: "fabrary",
  ownerId: "user-1",
  status: "exploratory",
  visibility: "team",
  tags: ["aggro"],
  notes: "Race fast, keep +[[card-1]] for reach.",
  linkedMetas: [{ id: "meta-1", name: "Summer Season" }],
  archivedAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};

function mockApi(patchBodies: unknown[] = []): void {
  let currentNotes = deck.notes;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json(USER);
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
      return json({ data: [{ id: "hero-dori", name: "Dorinthea", classes: [], talents: [] }] });
    }
    if (url.includes("/api/cards/card-1")) {
      return json({ id: "card-1", name: "Command and Conquer", pitch: 1, imageUrl: null });
    }
    if (url.includes("/iteration-entries")) return json({ data: [] });
    if (url.includes("/meta-readiness")) {
      return json({ deckId: "deck-1", metaId: "", metaName: "", rows: [] });
    }
    if (url.match(/\/api\/decks\/deck-1$/) && method === "PATCH") {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      patchBodies.push(body);
      currentNotes = (body as { notes?: string }).notes ?? currentNotes;
      return json({ ...deck, notes: currentNotes });
    }
    if (url.match(/\/api\/decks\/deck-1$/)) return json({ ...deck, notes: currentNotes });
    return json({}, 404);
  });
}

/** Render inside a router (archive navigates; the edit modal portals to the body). */
function renderDetail(deckToRender: DeckDetailType = deck) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => (
      <ActiveTeamProvider>
        <DeckDetail teamId="team-1" deck={deckToRender} />
      </ActiveTeamProvider>
    ),
  });
  const decksRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/decks",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([decksRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("DeckDetail", () => {
  it("shows the persistent header and the General tab (notes + linked metas) by default", async () => {
    mockApi();
    renderDetail();

    // Header: name and the external list link are always in view.
    expect(await screen.findByRole("heading", { name: "Aggro Dorinthea" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open deck list/i })).toHaveAttribute(
      "href",
      "https://fabrary.net/decks/abc",
    );

    // General tab is active: linked metas are their own block, and the notes render
    // with the inline +[[card-1]] token resolved to a card chip.
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Summer Season")).toBeInTheDocument();
    expect(await screen.findByText(/Command and Conquer/)).toBeInTheDocument();
  });

  it("navigates between tabs, revealing each section", async () => {
    mockApi();
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole("tab", { name: "Matchup Matrix" }));
    expect(screen.getByRole("heading", { name: /readiness/i })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Plan" }));
    expect(await screen.findByRole("heading", { name: /matchup game-plans/i })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Card ideas & Tasks" }));
    // The readiness heading is gone once we leave that tab (only one panel renders).
    expect(screen.queryByRole("heading", { name: /readiness/i })).not.toBeInTheDocument();
  });

  it("edits notes with the +card composer and persists a notes-only update", async () => {
    const patchBodies: unknown[] = [];
    mockApi(patchBodies);
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole("button", { name: /edit notes/i }));
    const notesEditor = screen.getByLabelText("Deck notes");
    expect(notesEditor).toHaveValue("Race fast, keep +[[card-1]] for reach.");

    await user.type(notesEditor, " Mull aggressively.");
    await user.click(screen.getByRole("button", { name: /save notes/i }));

    expect(patchBodies).toHaveLength(1);
    expect(patchBodies[0]).toEqual({
      notes: "Race fast, keep +[[card-1]] for reach. Mull aggressively.",
    });
  });

  it("opens the edit form in a modal dialog", async () => {
    mockApi();
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit deck" });
    expect(within(dialog).getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });
});
