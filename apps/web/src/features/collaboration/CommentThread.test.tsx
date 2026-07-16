import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";
import { typeInEditor } from "@/test/type-in-editor";

import { CommentThread } from "./CommentThread";

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

const members = {
  data: [
    { userId: "user-1", username: "alice", displayName: "Alice", role: "member", joinedAt: "x" },
    { userId: "user-2", username: "bob", displayName: "Bob", role: "member", joinedAt: "x" },
  ],
};

const thread = {
  data: [
    {
      id: "c1",
      subjectType: "deck",
      subjectId: "deck-1",
      author: { userId: "user-2", username: "bob", displayName: "Bob" },
      body: "top-level comment about +[[card-1]]",
      parentCommentId: null,
      archivedAt: null,
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
      replies: [
        {
          id: "c2",
          subjectType: "deck",
          subjectId: "deck-1",
          author: { userId: "user-1", username: "alice", displayName: "Alice" },
          body: "a nested reply",
          parentCommentId: "c1",
          archivedAt: null,
          createdAt: "2026-07-12T00:01:00.000Z",
          updatedAt: "2026-07-12T00:01:00.000Z",
          replies: [],
        },
      ],
    },
  ],
};

// Four flat top-level comments (oldest first, as the server orders them) for the
// previewCount tests: the preview keeps the most recent N, hiding the earliest ones.
function flatComment(index: number) {
  const ordinal = ["one", "two", "three", "four"][index - 1];
  return {
    id: `m${index}`,
    subjectType: "deck",
    subjectId: "deck-1",
    author: { userId: "user-2", username: "bob", displayName: "Bob" },
    body: `comment ${ordinal}`,
    parentCommentId: null,
    archivedAt: null,
    createdAt: `2026-07-12T00:0${index}:00.000Z`,
    updatedAt: `2026-07-12T00:0${index}:00.000Z`,
    replies: [],
  };
}

const manyThread = { data: [1, 2, 3, 4].map(flatComment) };

const currentUser = {
  id: "user-1",
  username: "alice",
  displayName: "Alice",
  isInstanceAdmin: false,
  authMethod: "password_totp",
  totpEnabled: true,
  discordUserId: null,
  discordUsername: null,
};

// The thread the GET returns; a test may swap it before rendering (reset in beforeEach).
let currentThread: unknown = thread;

function mockApi(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json(currentUser);
    if (url.includes("/api/members")) return json(members);
    if (url.includes("/api/cards/card-1")) {
      return json({ id: "card-1", name: "Command and Conquer", pitch: 1, imageUrl: null });
    }
    if (url.includes("/api/comments") && method === "GET") return json(currentThread);
    if (url.includes("/api/comments") && method === "POST") {
      return json({
        id: "c3",
        subjectType: "deck",
        subjectId: "deck-1",
        author: { userId: "user-1", username: "alice", displayName: "Alice" },
        body: "new",
        parentCommentId: null,
        archivedAt: null,
        createdAt: "2026-07-12T00:02:00.000Z",
        updatedAt: "2026-07-12T00:02:00.000Z",
        replies: [],
      });
    }
    return json({}, 404);
  });
}

function renderThread(previewCount?: number, highlightCommentId?: string): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ActiveTeamProvider>
        <CommentThread
          teamId="team-1"
          subjectType="deck"
          subjectId="deck-1"
          canComment
          {...(previewCount !== undefined ? { previewCount } : {})}
          {...(highlightCommentId !== undefined ? { highlightCommentId } : {})}
        />
      </ActiveTeamProvider>
    </QueryClientProvider>,
  );
}

describe("CommentThread", () => {
  beforeEach(() => {
    localStorage.clear();
    currentThread = thread;
    mockApi();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("renders a comment and its nested reply", async () => {
    renderThread();
    expect(await screen.findByText(/top-level comment about/)).toBeInTheDocument();
    expect(await screen.findByText("a nested reply")).toBeInTheDocument();
  });

  it("renders +card tokens in a comment body as inline card chips", async () => {
    renderThread();
    // The +[[card-1]] token in the comment body resolves to a "+Command and Conquer" chip.
    expect(await screen.findByText("+Command and Conquer")).toBeInTheDocument();
  });

  it("lists only in-team members in the mention autocomplete", async () => {
    renderThread();
    const composer = await screen.findByRole("textbox", { name: "New comment" });
    typeInEditor(composer, "hey @");

    const suggestions = await screen.findByRole("list", { name: /mention suggestions/i });
    expect(within(suggestions).getByText("Alice")).toBeInTheDocument();
    expect(within(suggestions).getByText("Bob")).toBeInTheDocument();

    // Narrowing the token filters to the matching member only.
    typeInEditor(composer, "bo", { append: true });
    expect(within(suggestions).getByText("Bob")).toBeInTheDocument();
    expect(within(suggestions).queryByText("Alice")).not.toBeInTheDocument();
  });

  it("previews only the most recent comments and expands the earlier ones on request", async () => {
    const user = userEvent.setup();
    currentThread = manyThread;
    renderThread(2);

    // The two most recent are shown; the two earliest are hidden behind the expander.
    expect(await screen.findByText("comment three")).toBeInTheDocument();
    expect(screen.getByText("comment four")).toBeInTheDocument();
    expect(screen.queryByText("comment one")).not.toBeInTheDocument();
    expect(screen.queryByText("comment two")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show 2 earlier comments" }));

    expect(screen.getByText("comment one")).toBeInTheDocument();
    expect(screen.getByText("comment two")).toBeInTheDocument();
  });

  it("renders every comment when no previewCount is given", async () => {
    currentThread = manyThread;
    renderThread();

    expect(await screen.findByText("comment one")).toBeInTheDocument();
    expect(screen.getByText("comment four")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /earlier comments/ })).not.toBeInTheDocument();
  });

  it("anchors and highlights the deep-linked comment, leaving others plain", async () => {
    renderThread(undefined, "c1");

    // Every comment carries a stable anchor id, matching or not.
    await screen.findByText(/top-level comment about/);
    const target = document.getElementById("comment-c1");
    const other = document.getElementById("comment-c2");
    expect(target).toHaveAttribute("data-comment-id", "c1");
    expect(other).toHaveAttribute("data-comment-id", "c2");

    // Only the targeted comment gets the highlight ring.
    await waitFor(() => expect(target?.className).toContain("ring-primary"));
    expect(other?.className).not.toContain("ring-primary");
  });

  it("highlights a deep-linked reply, not just top-level comments", async () => {
    renderThread(undefined, "c2");
    await screen.findByText("a nested reply");
    await waitFor(() =>
      expect(document.getElementById("comment-c2")?.className).toContain("ring-primary"),
    );
  });

  it("expands the hidden preview slice to reveal a deep-linked earlier comment", async () => {
    currentThread = manyThread;
    // previewCount=2 would hide the two earliest ("one"/"two"); the deep-link targets "one".
    renderThread(2, "m1");

    expect(await screen.findByText("comment one")).toBeInTheDocument();
    await waitFor(() =>
      expect(document.getElementById("comment-m1")?.className).toContain("ring-primary"),
    );
    // The expander is gone because the thread auto-expanded to surface the target.
    expect(screen.queryByRole("button", { name: /earlier comments/ })).not.toBeInTheDocument();
  });
});
