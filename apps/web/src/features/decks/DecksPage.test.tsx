import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { DecksPage } from "./DecksPage";

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

function mockApi(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json({ id: "user-1", displayName: "Alice" });
    if (url.includes("/api/game-config")) {
      return json({ gameId: "flesh-and-blood", identityLabel: "Hero", defaultBestOf: 1 });
    }
    if (url.includes("/api/formats")) return json({ data: [] });
    if (url.includes("/api/heroes")) return json({ data: [] });
    if (url.includes("/api/metas")) return json({ data: [], nextCursor: null });
    if (url.includes("/api/decks")) return json({ data: [], nextCursor: null });
    return json({}, 404);
  });
}

/** Render the page inside a router (deck rows/navigation use it) + team + query client. */
function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => (
      <ActiveTeamProvider>
        <DecksPage />
      </ActiveTeamProvider>
    ),
  });
  const deckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/decks/$deckId",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([deckRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("DecksPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("opens the deck create form in a modal dialog on 'New deck'", async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();

    // The form is not mounted until the modal opens.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "New deck" }));

    const dialog = await screen.findByRole("dialog", { name: "New deck" });
    expect(within(dialog).getByLabelText(/name/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /create deck/i })).toBeInTheDocument();
  });

  it("closes the modal when cancelled", async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "New deck" }));
    const dialog = await screen.findByRole("dialog", { name: "New deck" });
    await user.click(within(dialog).getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
