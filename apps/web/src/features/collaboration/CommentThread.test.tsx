import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
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
    if (url.includes("/api/comments") && method === "GET") return json(thread);
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

function renderThread(): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ActiveTeamProvider>
        <CommentThread teamId="team-1" subjectType="deck" subjectId="deck-1" canComment />
      </ActiveTeamProvider>
    </QueryClientProvider>,
  );
}

describe("CommentThread", () => {
  beforeEach(() => {
    localStorage.clear();
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
});
