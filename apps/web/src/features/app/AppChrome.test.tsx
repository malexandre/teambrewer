import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/app/theme";
import { ActiveTeamProvider } from "@/features/teams/active-team";

import { AppChrome } from "./AppChrome";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ADMIN_USER = {
  id: "admin-1",
  username: "admin",
  displayName: "Local Admin",
  isInstanceAdmin: true,
  authMethod: "password_totp",
  totpEnabled: true,
  discordUserId: null,
  discordUsername: null,
};
const MEMBER_USER = { ...ADMIN_USER, id: "user-2", username: "bob", isInstanceAdmin: false };

const TEAMS = [
  { teamId: "team-alpha", name: "Alpha", slug: "alpha", role: "member", gameId: "flesh-and-blood" },
];

function mockApi(user: typeof ADMIN_USER): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/me/teams")) return json({ data: TEAMS });
    if (url.endsWith("/api/me")) return json(user);
    if (url.includes("/api/notifications")) return json({ data: [], unreadCount: 0 });
    throw new Error(`Unexpected request: ${url}`);
  });
}

/** Mounts AppChrome inside a memory router seeded at `pathname`. */
function renderChrome(pathname: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <AppChrome>
        <Outlet />
      </AppChrome>
    ),
  });
  // Register the routes the nav links to so the links resolve without warnings.
  const paths = [
    "/",
    "/decks",
    "/metas",
    "/events",
    "/games",
    "/tasks",
    "/settings",
    "/admin/teams",
    "/admin/accounts",
    "/admin/members",
  ];
  const children = paths.map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => <div>{path}</div> }),
  );
  const routeTree = rootRoute.addChildren(children);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ActiveTeamProvider>
          <RouterProvider router={router} />
        </ActiveTeamProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // ThemeProvider resolves the system theme via matchMedia; jsdom lacks it.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("AppChrome navigation", () => {
  it("marks the Decks item active on the landing route", async () => {
    mockApi(MEMBER_USER);
    renderChrome("/");

    const nav = await screen.findByRole("navigation", { name: "Main" });
    const decks = within(nav).getByRole("link", { name: "Decks" });
    expect(decks).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Metas" })).not.toHaveAttribute("aria-current");
  });

  it("hides the Admin entry for a plain member and shows it for an admin", async () => {
    mockApi(MEMBER_USER);
    const { unmount } = renderChrome("/decks");
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
    unmount();

    mockApi(ADMIN_USER);
    renderChrome("/decks");
    expect(await screen.findByRole("link", { name: "Admin" })).toBeInTheDocument();
  });

  it("shows the Admin submenu only on admin routes", async () => {
    mockApi(ADMIN_USER);
    const { unmount } = renderChrome("/decks");
    await screen.findByRole("navigation", { name: "Main" });
    expect(screen.queryByRole("navigation", { name: "Section" })).not.toBeInTheDocument();
    unmount();

    mockApi(ADMIN_USER);
    renderChrome("/admin/accounts");
    const submenu = await screen.findByRole("navigation", { name: "Section" });
    expect(within(submenu).getByRole("link", { name: "Accounts" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(submenu).getByRole("link", { name: "Teams" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("opens the mobile drawer from the hamburger and closes it with Close", async () => {
    const user = userEvent.setup();
    mockApi(MEMBER_USER);
    renderChrome("/decks");

    const openButton = await screen.findByRole("button", { name: "Open menu" });
    expect(openButton).toHaveAttribute("aria-expanded", "false");
    await user.click(openButton);

    const drawer = await screen.findByRole("dialog", { name: "Menu" });
    expect(openButton).toHaveAttribute("aria-expanded", "true");
    await user.click(within(drawer).getByRole("button", { name: "Close" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument(),
    );
  });
});
