import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";

import { SettingsPage } from "@/features/account/SettingsPage";
import { AdminPage } from "@/features/admin/AdminPage";
import { AppChrome } from "@/features/app/AppChrome";
import { DeckDetailPage } from "@/features/decks/DeckDetailPage";
import { DecksPage } from "@/features/decks/DecksPage";
import { EventDetailPage } from "@/features/events/EventDetailPage";
import { EventsPage } from "@/features/events/EventsPage";
import { GameDetailPage } from "@/features/game-logging/GameDetailPage";
import { GamesPage } from "@/features/game-logging/GamesPage";
import { MetaDetailPage } from "@/features/metas/MetaDetailPage";
import { MetasPage } from "@/features/metas/MetasPage";
import { TasksPage } from "@/features/tasks/TasksPage";
import { ClaimPage } from "@/features/auth/ClaimPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { SetupPage } from "@/features/auth/SetupPage";
import { ActiveTeamProvider } from "@/features/teams/active-team";

const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-dvh bg-background text-foreground">
      <Outlet />
    </div>
  ),
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup/$token",
  component: function SetupRoute() {
    const { token } = setupRoute.useParams();
    return <SetupPage token={token} />;
  },
});

const claimRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/claim/$token",
  component: function ClaimRoute() {
    const { token } = claimRoute.useParams();
    return <ClaimPage token={token} />;
  },
});

// Pathless layout: everything under it requires authentication and an active team.
const authenticatedLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  component: () => (
    <RequireAuth>
      <ActiveTeamProvider>
        <AppChrome>
          <Outlet />
        </AppChrome>
      </ActiveTeamProvider>
    </RequireAuth>
  ),
});

const homeRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/",
  component: DecksPage,
});

const decksRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/decks",
  component: DecksPage,
});

const deckDetailRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/decks/$deckId",
  component: function DeckDetailRoute() {
    const { deckId } = deckDetailRoute.useParams();
    return <DeckDetailPage deckId={deckId} />;
  },
});

const metasRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/metas",
  component: MetasPage,
});

const metaDetailRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/metas/$metaId",
  component: function MetaDetailRoute() {
    const { metaId } = metaDetailRoute.useParams();
    return <MetaDetailPage metaId={metaId} />;
  },
});

const eventsRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/events",
  component: EventsPage,
});

const eventDetailRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/events/$eventId",
  component: function EventDetailRoute() {
    const { eventId } = eventDetailRoute.useParams();
    return <EventDetailPage eventId={eventId} />;
  },
});

const gamesRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/games",
  component: GamesPage,
});

const gameDetailRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/games/$gameLogId",
  component: function GameDetailRoute() {
    const { gameLogId } = gameDetailRoute.useParams();
    return <GameDetailPage gameLogId={gameLogId} />;
  },
});

const tasksRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/tasks",
  component: TasksPage,
});

const adminRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/admin",
  component: AdminPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  claimRoute,
  authenticatedLayout.addChildren([
    homeRoute,
    decksRoute,
    deckDetailRoute,
    metasRoute,
    metaDetailRoute,
    eventsRoute,
    eventDetailRoute,
    gamesRoute,
    gameDetailRoute,
    tasksRoute,
    adminRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
