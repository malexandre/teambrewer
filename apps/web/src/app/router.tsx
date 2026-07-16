import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";

import { SettingsPage } from "@/features/account/SettingsPage";
import { AdminAccountsPage, AdminMembersPage, AdminTeamsPage } from "@/features/admin/AdminPage";
import { AppChrome } from "@/features/app/AppChrome";
import { DeckDetailPage } from "@/features/decks/DeckDetailPage";
import { DecksPage } from "@/features/decks/DecksPage";
import { EventDetailPage } from "@/features/events/EventDetailPage";
import { EventsPage } from "@/features/events/EventsPage";
import { GameDetailPage } from "@/features/game-logging/GameDetailPage";
import { EditGameLogPage, NewGameLogPage } from "@/features/game-logging/GameLogPage";
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

// The active tab lives in the path (`/decks/:deckId/activity`) so a deck section is
// shareable and a notification can deep-link straight to it; `DeckDetail` validates the
// segment and falls back to General for anything unknown.
const deckDetailTabRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/decks/$deckId/$deckTab",
  component: function DeckDetailTabRoute() {
    const { deckId, deckTab } = deckDetailTabRoute.useParams();
    return <DeckDetailPage deckId={deckId} activeTabId={deckTab} />;
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

// The static `/games/new` outranks the dynamic `/games/$gameLogId`, so logging a
// game gets its own focused, full-screen route rather than a segment id.
const gameNewRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/games/new",
  component: NewGameLogPage,
});

const gameDetailRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/games/$gameLogId",
  component: function GameDetailRoute() {
    const { gameLogId } = gameDetailRoute.useParams();
    return <GameDetailPage gameLogId={gameLogId} />;
  },
});

const gameEditRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/games/$gameLogId/edit",
  component: function GameEditRoute() {
    const { gameLogId } = gameEditRoute.useParams();
    return <EditGameLogPage gameLogId={gameLogId} />;
  },
});

// The open task lives in the path via an optional segment (`/tasks` or `/tasks/:taskId`)
// so the board and its open task are both reflected in a shareable URL and a notification
// can deep-link a task — while the single route keeps the board mounted (its scope/filter
// state survives) as the task id appears and disappears. There is no standalone task page:
// `TasksPage` opens the detail dialog for whichever task the path names.
const tasksRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/tasks/{-$taskId}",
  component: function TasksRoute() {
    const { taskId } = tasksRoute.useParams();
    return <TasksPage openTaskId={taskId} />;
  },
});

// Bare `/admin` redirects to the first sub-page so old links keep working.
const adminIndexRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/admin",
  beforeLoad: () => {
    throw redirect({ to: "/admin/teams" });
  },
});

const adminTeamsRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/admin/teams",
  component: AdminTeamsPage,
});

const adminAccountsRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/admin/accounts",
  component: AdminAccountsPage,
});

const adminMembersRoute = createRoute({
  getParentRoute: () => authenticatedLayout,
  path: "/admin/members",
  component: AdminMembersPage,
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
    deckDetailTabRoute,
    metasRoute,
    metaDetailRoute,
    eventsRoute,
    eventDetailRoute,
    gamesRoute,
    gameNewRoute,
    gameDetailRoute,
    gameEditRoute,
    tasksRoute,
    adminIndexRoute,
    adminTeamsRoute,
    adminAccountsRoute,
    adminMembersRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
