import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActiveTeamProvider } from "@/features/teams/active-team";

import { GamePlanSection } from "./GamePlanSection";

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

function planWith(metaDeckEntryIds: string[]) {
  return {
    id: "gp1",
    ourDeckId: "deck-1",
    ourDeckName: "Aggro Dori",
    formatId: "format-1",
    name: "vs Briar",
    body: "Race the clock; keep +[[card-1]] for the on-hit.",
    metaDeckEntryIds,
    updatedBy: { userId: "user-1", username: "alice", displayName: "Alice" },
    archivedAt: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  };
}

const formatMeta = {
  id: "meta-1",
  name: "Summer Season",
  formatId: "format-1",
  formatName: "Classic Constructed",
  description: "",
  startDate: "2026-06-01T00:00:00.000Z",
  endDate: "2026-08-31T00:00:00.000Z",
  archivedAt: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  changeReason: null,
  changeReasonHeroId: null,
  changeReasonImageUrl: null,
};

const oscilioEntry = {
  id: "entry-oscilio",
  metaId: "meta-1",
  tier: "meta_defining",
  heroId: null,
  label: "Oscilio",
  opponentSnapshotLabel: "Oscilio",
  notes: "",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

// A hero-carrying entry: its display name leads with the resolved hero name (Briar),
// then the archetype label, joined by a middle dot.
const briarEntry = {
  id: "entry-briar",
  metaId: "meta-1",
  tier: "contender",
  heroId: "hero-1",
  label: "Aggressive",
  opponentSnapshotLabel: "Briar · Aggressive",
  notes: "",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

/**
 * Wire the reads the section depends on. `patchedEntryIds` is stateful so a PATCH that
 * replaces the plan's `metaDeckEntryIds` is reflected when the invalidated list refetches
 * (matching the R-1 replace-the-whole-set contract). Captured PATCH bodies are returned.
 */
function mockApi(
  patchBodies: unknown[] = [],
  initialAttached: string[] = [],
  commentsThread: unknown = { data: [] },
): void {
  let attachedEntryIds: string[] = initialAttached;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json(CURRENT_USER);
    if (url.includes("/api/members")) return json({ data: [] });
    if (url.includes("/api/comments") && method === "GET") return json(commentsThread);
    if (url.includes("/api/heroes")) {
      return json({ data: [{ id: "hero-1", name: "Briar", classes: [], talents: [] }] });
    }
    if (url.includes("/api/cards/card-1")) {
      return json({ id: "card-1", name: "Command and Conquer", pitch: 1, imageUrl: null });
    }
    if (url.includes("/api/metas/meta-1/deck-entries")) {
      return json({ data: [oscilioEntry, briarEntry] });
    }
    if (url.includes("/api/metas")) return json({ data: [formatMeta], nextCursor: null });
    if (url.match(/\/api\/game-plans\/gp1$/) && method === "PATCH") {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      patchBodies.push(body);
      attachedEntryIds = (body as { metaDeckEntryIds?: string[] }).metaDeckEntryIds ?? [];
      return json(planWith(attachedEntryIds));
    }
    if (url.includes("/api/game-plans")) {
      return json({ data: [planWith(attachedEntryIds)], nextCursor: null });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

function renderSection(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveTeamProvider>{ui}</ActiveTeamProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("GamePlanSection", () => {
  it("renders the deck's plans with the matchup header, body, and inline card chips", async () => {
    mockApi();
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    expect(await screen.findByText("vs Briar")).toBeInTheDocument();
    expect(screen.getByText(/Race the clock/)).toBeInTheDocument();
    // The +[[card-1]] token resolves to an inline "+Command and Conquer" chip.
    expect(await screen.findByText(/Command and Conquer/)).toBeInTheDocument();
  });

  it("shows each plan's discussion by default, without a reveal toggle", async () => {
    mockApi();
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    await screen.findByText("vs Briar");
    // The discussion is the body of the card, not hidden behind a "Discussion" button.
    expect(screen.getByRole("heading", { name: "Discussion" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discussion" })).not.toBeInTheDocument();
  });

  it("collapses a plan onto its matchup header, hiding the plan body and discussion", async () => {
    const user = userEvent.setup();
    mockApi();
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    await screen.findByText("vs Briar");
    expect(screen.getByRole("heading", { name: "Discussion" })).toBeInTheDocument();

    // The tinted matchup header doubles as the collapse toggle.
    await user.click(screen.getByRole("button", { name: /vs Briar/ }));

    expect(screen.queryByRole("heading", { name: "Discussion" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Race the clock/)).not.toBeInTheDocument();
    // The header (and its matchup name) stays, so the plan is still findable.
    expect(screen.getByText("vs Briar")).toBeInTheDocument();
  });

  it("does not show the meta-coverage chips in the read view", async () => {
    // The plan covers Oscilio, but coverage is edited only via the editor's multi-select.
    mockApi([], ["entry-oscilio"]);
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    await screen.findByText("vs Briar");
    expect(screen.queryByText(/Covers/)).not.toBeInTheDocument();
    expect(screen.queryByText("Oscilio")).not.toBeInTheDocument();
  });

  it("summarises the thread activity in the card header", async () => {
    const commentsThread = {
      data: [
        {
          id: "c1",
          subjectType: "matchup_game_plan",
          subjectId: "gp1",
          author: { userId: "user-2", username: "bob", displayName: "Bob" },
          body: "Cut a blue for the on-hit?",
          parentCommentId: null,
          archivedAt: null,
          createdAt: "2026-07-12T00:00:00.000Z",
          updatedAt: "2026-07-12T00:00:00.000Z",
          replies: [
            {
              id: "c2",
              subjectType: "matchup_game_plan",
              subjectId: "gp1",
              author: { userId: "user-1", username: "alice", displayName: "Alice" },
              body: "Tried it, feels great.",
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
    mockApi([], [], commentsThread);
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    await screen.findByText("vs Briar");
    // Comment + reply = 2 active comments, with a relative "last reply" (value left to the clock).
    expect(await screen.findByText(/2 comments/)).toBeInTheDocument();
    expect(screen.getByText(/last reply/)).toBeInTheDocument();
  });

  it("reveals the editor with the name field and the plan body composer when writing", async () => {
    mockApi();
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    await screen.findByText("vs Briar");
    await userEvent.click(screen.getByRole("button", { name: "Write a game-plan" }));

    // The body is a +card-enabled composer (type + to link a card inline).
    expect(screen.getByLabelText("Plan")).toBeInTheDocument();
    // A plan is titled by a free-text name.
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("shows the current name in edit mode and renames the plan on save", async () => {
    const user = userEvent.setup();
    const patchBodies: unknown[] = [];
    mockApi(patchBodies);
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    await screen.findByText("vs Briar");
    await user.click(screen.getByRole("button", { name: "Edit" }));
    // The name field is pre-filled with the plan's current name (visible + editable).
    const nameField = screen.getByLabelText("Name");
    expect(nameField).toHaveValue("vs Briar");
    await user.clear(nameField);
    await user.type(nameField, "vs Control");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchBodies.at(-1)).toMatchObject({ name: "vs Control" }));
  });

  it("hides the write action when the deck is archived", async () => {
    mockApi();
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived />,
    );

    await screen.findByText("vs Briar");
    expect(screen.queryByRole("button", { name: "Write a game-plan" })).not.toBeInTheDocument();
  });

  it("assigns a plan to a current-meta deck entry from the editor's multi-select", async () => {
    const user = userEvent.setup();
    const patchBodies: unknown[] = [];
    mockApi(patchBodies);
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    await screen.findByText("vs Briar");
    // Assignment now lives in edit mode: open the editor, then the "Covers matchups" box.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(await screen.findByRole("combobox", { name: "Covers matchups" }));
    await user.click(screen.getByRole("option", { name: /Oscilio/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    // The PATCH sends the whole desired set (R-1 replace contract), alongside the body.
    // Coverage is edited here in the editor but is intentionally not shown in the read view.
    await waitFor(() =>
      expect(patchBodies.at(-1)).toMatchObject({ metaDeckEntryIds: ["entry-oscilio"] }),
    );
  });

  it("unassigns a plan from a meta deck entry from the editor's multi-select", async () => {
    const user = userEvent.setup();
    const patchBodies: unknown[] = [];
    mockApi(patchBodies, ["entry-oscilio"]);
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    await screen.findByText("vs Briar");
    // The plan starts covering Oscilio; open the editor and untick it.
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(await screen.findByRole("combobox", { name: "Covers matchups" }));
    await user.click(screen.getByRole("option", { name: /Oscilio/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    // The last PATCH replaces the set with an empty array (detached).
    expect(patchBodies.at(-1)).toMatchObject({ metaDeckEntryIds: [] });
  });
});
