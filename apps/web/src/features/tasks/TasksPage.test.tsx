import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { TasksPage } from "./TasksPage";

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

const CURRENT_USER = {
  id: "user-1",
  username: "alice",
  displayName: "Alice",
  isInstanceAdmin: false,
  authMethod: "password_totp",
  totpEnabled: true,
  discordUserId: null,
  discordUsername: null,
};

const task = (overrides: Record<string, unknown>) => ({
  id: "t1",
  title: "Test Bravado over Sink Below",
  description: "Try +[[card-x]] in go-wide.",
  deckId: null,
  deckName: null,
  author: { userId: "user-1", username: "alice", displayName: "Alice" },
  assignee: null,
  status: "proposed",
  report: "",
  voteCount: 2,
  viewerHasVoted: true,
  archivedAt: null,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
  ...overrides,
});

/** Records the assignee filter the list requested, so the scope toggle is observable. */
function mockApi(): { assigneeQueries: (string | null)[] } {
  const assigneeQueries: (string | null)[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json(CURRENT_USER);
    if (url.includes("/api/members")) {
      return json({
        data: [
          {
            userId: "user-1",
            username: "alice",
            displayName: "Alice",
            role: "member",
            joinedAt: "2026-07-12T00:00:00.000Z",
          },
        ],
      });
    }
    if (url.includes("/api/decks")) return json({ data: [], nextCursor: null });
    if (url.includes("/api/cards/card-x")) {
      return json({ id: "card-x", name: "Bravado", pitch: 3, imageUrl: null });
    }
    if (url.includes("/api/comments") && (init?.method ?? "GET") === "GET") {
      return json({
        data: [
          {
            id: "cm1",
            subjectType: "task",
            subjectId: "t1",
            author: { userId: "user-2", username: "bob", displayName: "Bob" },
            body: "let's try this line",
            parentCommentId: null,
            archivedAt: null,
            createdAt: "2026-07-12T00:00:00.000Z",
            updatedAt: "2026-07-12T00:00:00.000Z",
            replies: [],
          },
        ],
      });
    }
    if (url.includes("/api/activity")) return json({ data: [], nextCursor: null });
    // A single task by id (the deep-link fallback fetch), before the list match below.
    if (url.match(/\/api\/tasks\/[^/?]+$/)) return json(task({ id: "t1", status: "proposed" }));
    if (url.includes("/api/tasks")) {
      assigneeQueries.push(new URL(url, "http://x").searchParams.get("assigneeId"));
      return json({
        data: [
          task({ id: "t1", status: "proposed" }),
          task({
            id: "t2",
            title: "Finished tuning",
            description: "",
            status: "finished",
            report: "Went 8-2; adopting.",
            author: { userId: "user-2", username: "bob", displayName: "Bob" },
            viewerHasVoted: false,
            voteCount: 5,
          }),
        ],
        nextCursor: null,
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  return { assigneeQueries };
}

/**
 * Render the tasks board inside a memory router mirroring the app's single optional-param
 * route (`/tasks/{-$taskId}`), so opening/closing a task is URL-driven and the location
 * hash feeds the deep-link highlight. `initialEntry` seeds the starting URL.
 */
function renderPage(initialEntry = "/tasks") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute();
  const tasksRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/tasks/{-$taskId}",
    component: function TasksRoute() {
      const { taskId } = tasksRoute.useParams();
      return (
        <ActiveTeamProvider>
          <TasksPage openTaskId={taskId} />
        </ActiveTeamProvider>
      );
    },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([tasksRoute]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
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

describe("TasksPage", () => {
  it("renders tasks in status columns", async () => {
    mockApi();
    renderPage();

    // The board has a column per status label…
    expect(await screen.findByText("Proposed")).toBeInTheDocument();
    expect(screen.getByText("Finished")).toBeInTheDocument();
    // …and each task's title shows on its compact board card.
    expect(screen.getByText("Test Bravado over Sink Below")).toBeInTheDocument();
    expect(screen.getByText("Finished tuning")).toBeInTheDocument();
  });

  it("reflects the viewer's vote on the vote control", async () => {
    mockApi();
    renderPage();

    const retract = await screen.findByRole("button", { name: "Retract upvote" });
    expect(retract).toHaveAttribute("aria-pressed", "true");
    const upvote = screen.getByRole("button", { name: "Upvote" });
    expect(upvote).toHaveAttribute("aria-pressed", "false");
  });

  it("opens and closes a task's detail dialog (URL-driven)", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Open task: Test Bravado over Sink Below" }),
    );
    // The +[[card-x]] token resolves to the "+Bravado" chip in the detail dialog.
    expect(await screen.findByText("+Bravado")).toBeInTheDocument();

    // Closing drops the task from the URL, so the dialog goes away (regression guard: an
    // empty params object would keep the optional param and leave the dialog stuck open).
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("narrows to the viewer's tasks when the 'Assigned to me' scope is chosen", async () => {
    const { assigneeQueries } = mockApi();
    renderPage();

    await screen.findByText("Test Bravado over Sink Below");
    await userEvent.click(screen.getByRole("button", { name: "Assigned to me" }));
    await waitFor(() => expect(assigneeQueries).toContain("user-1"));
  });

  it("reveals a finished task's report from its detail dialog", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Open task: Finished tuning" }));
    expect(screen.queryByText("Went 8-2; adopting.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByText("Went 8-2; adopting.")).toBeInTheDocument();
  });

  it("reveals the task form when creating", async () => {
    mockApi();
    renderPage();

    await screen.findByText("Test Bravado over Sink Below");
    await userEvent.click(screen.getByRole("button", { name: "New task" }));
    expect(screen.getByLabelText("Task title")).toBeInTheDocument();
    expect(screen.getByLabelText("Task description")).toBeInTheDocument();
  });

  it("opens the deep-linked task's dialog on arrival", async () => {
    mockApi();
    renderPage("/tasks/t1");

    // The dialog opens with the task's +card-rich description (the "+Bravado" chip).
    expect(await screen.findByText("+Bravado")).toBeInTheDocument();
  });

  it("auto-opens the discussion and highlights the deep-linked comment", async () => {
    mockApi();
    renderPage("/tasks/t1#comment-cm1");

    // Discussion is open (not behind the toggle) and the source comment is highlighted.
    expect(await screen.findByText("let's try this line")).toBeInTheDocument();
    await waitFor(() =>
      expect(document.getElementById("comment-cm1")?.className).toContain("ring-primary"),
    );
  });
});
