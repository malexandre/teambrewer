import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
    opponentHeroId: "hero-1",
    opponentArchetypeLabel: "Briar",
    opponentRef: "hero:hero-1|label:briar",
    opponentSnapshotLabel: "Briar",
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

/**
 * Wire the reads the section depends on. `patchedEntryIds` is stateful so a PATCH that
 * replaces the plan's `metaDeckEntryIds` is reflected when the invalidated list refetches
 * (matching the R-1 replace-the-whole-set contract). Captured PATCH bodies are returned.
 */
function mockApi(patchBodies: unknown[] = []): void {
  let attachedEntryIds: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/me/teams")) return json({ data: [TEAM] });
    if (url.endsWith("/api/me")) return json(CURRENT_USER);
    if (url.includes("/api/heroes")) {
      return json({ data: [{ id: "hero-1", name: "Briar", classes: [], talents: [] }] });
    }
    if (url.includes("/api/cards/card-1")) {
      return json({ id: "card-1", name: "Command and Conquer", pitch: 1, imageUrl: null });
    }
    if (url.includes("/api/metas/meta-1/deck-entries")) return json({ data: [oscilioEntry] });
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

  it("reveals the editor with the plan body composer and the opponent subject fields when writing", async () => {
    mockApi();
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    await screen.findByText("vs Briar");
    await userEvent.click(screen.getByRole("button", { name: "Write a game-plan" }));

    // The body is a +card-enabled composer (type + to link a card inline).
    expect(screen.getByLabelText("Plan")).toBeInTheDocument();
    // The opponent subject is a required archetype label with an optional hero qualifier.
    expect(screen.getByLabelText("Archetype label")).toBeInTheDocument();
  });

  it("hides the write action when the deck is archived", async () => {
    mockApi();
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived />,
    );

    await screen.findByText("vs Briar");
    expect(screen.queryByRole("button", { name: "Write a game-plan" })).not.toBeInTheDocument();
  });

  it("assigns a plan to a current-meta deck entry and reflects it as attached", async () => {
    const patchBodies: unknown[] = [];
    mockApi(patchBodies);
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    await screen.findByText("vs Briar");
    // Oscilio is an unassigned current-meta entry, offered as an assign target.
    await userEvent.click(await screen.findByRole("button", { name: "+ Oscilio" }));

    // The PATCH replaces the whole set with the newly-attached id (R-1 contract).
    expect(patchBodies).toContainEqual({ metaDeckEntryIds: ["entry-oscilio"] });
    // After the invalidated list refetches, Oscilio shows as attached (with an unassign).
    expect(await screen.findByRole("button", { name: "Unassign Oscilio" })).toBeInTheDocument();
  });

  it("unassigns a plan from a meta deck entry", async () => {
    const patchBodies: unknown[] = [];
    mockApi(patchBodies);
    renderSection(
      <GamePlanSection teamId="team-1" deckId="deck-1" formatId="format-1" deckArchived={false} />,
    );

    await screen.findByText("vs Briar");
    await userEvent.click(await screen.findByRole("button", { name: "+ Oscilio" }));
    await userEvent.click(await screen.findByRole("button", { name: "Unassign Oscilio" }));

    // The last PATCH replaces the set with an empty array (detached).
    expect(patchBodies.at(-1)).toEqual({ metaDeckEntryIds: [] });
    expect(await screen.findByRole("button", { name: "+ Oscilio" })).toBeInTheDocument();
  });
});
