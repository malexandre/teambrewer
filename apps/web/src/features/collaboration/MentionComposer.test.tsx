import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { typeInEditor as typeInto } from "@/test/type-in-editor";

import { MentionComposer } from "./MentionComposer";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const members = {
  data: [
    { userId: "user-1", username: "alice", displayName: "Alice", role: "member", joinedAt: "x" },
    { userId: "user-2", username: "bob", displayName: "Bob", role: "member", joinedAt: "x" },
  ],
};

const cards = [{ id: "cnc", name: "Command and Conquer", pitch: 1, imageUrl: null }];

function mockApi(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/members")) return json(members);
    // GET /cards/:id (resolve one card) vs GET /cards?query= (search list).
    if (url.includes("/api/cards/")) return json(cards[0]);
    if (url.includes("/api/cards")) return json({ data: cards, nextCursor: null });
    return json({}, 404);
  });
}

function renderComposer(props: Partial<Parameters<typeof MentionComposer>[0]> = {}): {
  onSubmit: ReturnType<typeof vi.fn>;
} {
  const onSubmit = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui: ReactNode = (
    <QueryClientProvider client={queryClient}>
      <MentionComposer
        teamId="team-1"
        submitLabel="Save"
        placeholder="Describe the task…"
        ariaLabel="Task description"
        isPending={false}
        onSubmit={onSubmit}
        {...props}
      />
    </QueryClientProvider>
  );
  render(ui);
  return { onSubmit };
}

function editor(): HTMLElement {
  return screen.getByRole("textbox", { name: "Task description" });
}

function typeInEditor(text: string): void {
  typeInto(editor(), text);
}

describe("MentionComposer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts a card pill backed by a stable +[[cardId]] token when a suggestion is chosen", async () => {
    mockApi();
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ enableCardMentions: true });

    typeInEditor("try +comm");

    const suggestions = await screen.findByRole("list", { name: /card suggestions/i });
    await user.click(within(suggestions).getByText("Command and Conquer"));

    // The editor shows the card's name, not the opaque id token.
    expect(editor().textContent).toContain("+Command and Conquer");
    expect(editor().textContent).not.toContain("cnc");

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("try +[[cnc]]");
  });

  it("keeps @member mentions inserting a bare @username", async () => {
    mockApi();
    const user = userEvent.setup();
    const { onSubmit } = renderComposer({ enableCardMentions: true });

    typeInEditor("ping @ali");

    const suggestions = await screen.findByRole("list", { name: /mention suggestions/i });
    await user.click(within(suggestions).getByText("Alice"));

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledWith("ping @alice");
  });

  it("renders an existing body's card token as a name pill when editing", async () => {
    mockApi();
    renderComposer({ enableCardMentions: true, initialValue: "sideboard +[[cnc]] please" });

    // The pill resolves to the card name (via GET /cards/:id); the raw id never shows.
    expect(await within(editor()).findByText("+Command and Conquer")).toBeInTheDocument();
    expect(editor().textContent).toBe("sideboard +Command and Conquer please");
  });

  it("shows a hint row when a non-empty +card query matches no cards", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/members")) return json(members);
      if (url.includes("/api/cards")) return json({ data: [], nextCursor: null });
      return json({}, 404);
    });
    renderComposer({ enableCardMentions: true });

    typeInEditor("need +nope");

    expect(await screen.findByText(/no matching cards/i)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /card suggestions/i })).not.toBeInTheDocument();
  });

  it("shows no dropdown or hint while the +card query is still empty", async () => {
    mockApi();
    renderComposer({ enableCardMentions: true });

    // A bare `+` with no query text: no search runs, so neither suggestions nor a hint.
    typeInEditor("start +");

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(screen.queryByText(/no matching cards/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /card suggestions/i })).not.toBeInTheDocument();
  });

  it("does not autocomplete cards when card mentions are disabled (the default)", async () => {
    mockApi();
    renderComposer();

    typeInEditor("try +comm");

    // Give any (unexpected) debounced card search time to resolve.
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(screen.queryByRole("list", { name: /card suggestions/i })).not.toBeInTheDocument();
  });
});
