import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IterationLog } from "./IterationLog";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const iterationEntry = {
  id: "iter-1",
  deckId: "deck-1",
  authorId: "user-1",
  body: "Swapped tech after the event: +[[card-1]]",
  createdAt: "2026-07-12T00:00:00.000Z",
};

function mockApi(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/cards/card-1")) {
      return json({ id: "card-1", name: "Command and Conquer", pitch: 1, imageUrl: null });
    }
    if (url.includes("/iteration-entries")) return json({ data: [iterationEntry] });
    // The composer's member query is not needed (member mentions are off) — 404 is harmless.
    return json({}, 404);
  });
}

function renderLog(canAddEntry: boolean): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactNode = (
    <QueryClientProvider client={queryClient}>
      <IterationLog teamId="team-1" deckId="deck-1" canAddEntry={canAddEntry} />
    </QueryClientProvider>
  );
  render(ui);
}

describe("IterationLog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders an entry body's +card token as an inline chip", async () => {
    mockApi();
    renderLog(false);

    // The +[[card-1]] token resolves to a "+Command and Conquer" chip …
    expect(await screen.findByText("+Command and Conquer")).toBeInTheDocument();
    // … and the surrounding prose is preserved.
    expect(screen.getByText(/Swapped tech after the event/)).toBeInTheDocument();
  });

  it("offers a card-enabled composer to members who may annotate the deck", async () => {
    mockApi();
    renderLog(true);

    expect(await screen.findByLabelText("New iteration entry")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add entry" })).toBeInTheDocument();
  });

  it("hides the composer for read-only viewers", async () => {
    mockApi();
    renderLog(false);

    await screen.findByText("+Command and Conquer");
    expect(screen.queryByLabelText("New iteration entry")).not.toBeInTheDocument();
  });
});
