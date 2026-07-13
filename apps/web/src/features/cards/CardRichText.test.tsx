import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CardRichText } from "./CardRichText";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Resolves GET /api/cards/:cardId for known ids; 404s everything else. */
function mockCardById(known: Record<string, { name: string; pitch: number | null }>): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = /\/api\/cards\/([^/?]+)/.exec(url);
    const cardId = match?.[1];
    if (cardId && known[cardId]) {
      return json({ id: cardId, imageUrl: null, ...known[cardId] });
    }
    return json({ error: { code: "not_found", message: "Card not found." } }, 404);
  });
}

function renderRichText(body: string): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactNode = (
    <QueryClientProvider client={queryClient}>
      <CardRichText teamId="team-1" body={body} />
    </QueryClientProvider>
  );
  render(ui);
}

describe("CardRichText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a chip for a known card id and surrounding text", async () => {
    mockCardById({ cnc: { name: "Command and Conquer", pitch: 1 } });
    renderRichText("great vs control: +[[cnc]] wins");

    expect(await screen.findByText("+Command and Conquer")).toBeInTheDocument();
    // The surrounding prose is preserved.
    expect(screen.getByText(/great vs control:/)).toBeInTheDocument();
    expect(screen.getByText(/wins/)).toBeInTheDocument();
  });

  it("renders a graceful fallback for an unknown card id", async () => {
    mockCardById({});
    renderRichText("stale link: +[[ghost]]");

    expect(await screen.findByText("+[unknown card]")).toBeInTheDocument();
  });

  it("renders plain text (including @username) with no chips when there are no tokens", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderRichText("ping @alice about the matchup");

    expect(screen.getByText("ping @alice about the matchup")).toBeInTheDocument();
    // No card tokens → no card lookups.
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
