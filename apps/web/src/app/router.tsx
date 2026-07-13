import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";

import { SettingsPage } from "@/features/account/SettingsPage";
import { AdminPage } from "@/features/admin/AdminPage";
import { AppChrome } from "@/features/app/AppChrome";
import { HomePage } from "@/features/app/HomePage";
import { CardsPage } from "@/features/cards/CardsPage";
import { ActivityPage } from "@/features/collaboration/ActivityPage";
import { DeckDetailPage } from "@/features/decks/DeckDetailPage";
import { DecksPage } from "@/features/decks/DecksPage";
import { EventDetailPage } from "@/features/events/EventDetailPage";
import { EventsPage } from "@/features/events/EventsPage";
import { GameDetailPage } from "@/features/game-logging/GameDetailPage";
import { GamesPage } from "@/features/game-logging/GamesPage";
import { KnowledgePage } from "@/features/knowledge/KnowledgePage";
import { PrimerDetailPage } from "@/features/knowledge/PrimerDetailPage";
import { MatchupsPage } from "@/features/matchups/MatchupsPage";
import { AssignmentsPage } from "@/features/testing-queue/AssignmentsPage";
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

const teamRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/team",
  component: HomePage,
});

const cardsRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/cards",
  component: CardsPage,
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

const matchupsRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/matchups",
  component: MatchupsPage,
});

const assignmentsRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/assignments",
  component: AssignmentsPage,
});

const knowledgeRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/knowledge",
  component: KnowledgePage,
});

const primerDetailRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/knowledge/primers/$primerId",
  component: function PrimerDetailRoute() {
    const { primerId } = primerDetailRoute.useParams();
    return <PrimerDetailPage primerId={primerId} />;
  },
});

const activityRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/activity",
  component: ActivityPage,
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
    teamRoute,
    cardsRoute,
    decksRoute,
    deckDetailRoute,
    eventsRoute,
    eventDetailRoute,
    gamesRoute,
    gameDetailRoute,
    matchupsRoute,
    assignmentsRoute,
    knowledgeRoute,
    primerDetailRoute,
    activityRoute,
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
