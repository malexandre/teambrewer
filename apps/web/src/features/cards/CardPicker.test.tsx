import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CardPicker } from "./CardPicker";

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockCardSearch(
  cards: { id: string; name: string; pitch: number | null; imageUrl: string | null }[],
) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/cards")) {
      return new Response(JSON.stringify({ data: cards, nextCursor: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("{}", { status: 404, headers: { "content-type": "application/json" } });
  });
}

describe("CardPicker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("autocompletes after typing and shows name + pitch", async () => {
    mockCardSearch([{ id: "cnc", name: "Command and Conquer", pitch: 1, imageUrl: null }]);
    const user = userEvent.setup();

    renderWithClient(<CardPicker teamId="team-1" />);
    await user.type(screen.getByRole("combobox", { name: /search cards/i }), "command");

    expect(await screen.findByRole("option", { name: /Command and Conquer/i })).toBeInTheDocument();
    expect(screen.getByText(/pitch 1 \(Red\)/i)).toBeInTheDocument();
  });

  it("calls onSelect with the chosen card", async () => {
    mockCardSearch([{ id: "cnc", name: "Command and Conquer", pitch: 1, imageUrl: null }]);
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderWithClient(<CardPicker teamId="team-1" onSelect={onSelect} />);
    await user.type(screen.getByRole("combobox", { name: /search cards/i }), "command");

    await user.click(await screen.findByRole("option", { name: /Command and Conquer/i }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cnc", name: "Command and Conquer" }),
    );
  });

  it("clears the search input and collapses results after selecting", async () => {
    mockCardSearch([{ id: "cnc", name: "Command and Conquer", pitch: 1, imageUrl: null }]);
    const user = userEvent.setup();

    renderWithClient(<CardPicker teamId="team-1" onSelect={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: /search cards/i });
    await user.type(input, "command");
    await user.click(await screen.findByRole("option", { name: /Command and Conquer/i }));

    expect(input).toHaveValue("");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("selects with the keyboard and clears", async () => {
    mockCardSearch([{ id: "cnc", name: "Command and Conquer", pitch: 1, imageUrl: null }]);
    const onSelect = vi.fn();
    const user = userEvent.setup();

    renderWithClient(<CardPicker teamId="team-1" onSelect={onSelect} />);
    const input = screen.getByRole("combobox", { name: /search cards/i });
    await user.type(input, "command");
    // autoSelect highlights the top result as it arrives, so Enter picks it.
    await screen.findByRole("option", { name: /Command and Conquer/i });
    await waitFor(() => expect(input).toHaveAttribute("aria-activedescendant"));
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "cnc" }));
    expect(input).toHaveValue("");
  });

  it("does not search on an empty query", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderWithClient(<CardPicker teamId="team-1" />);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
