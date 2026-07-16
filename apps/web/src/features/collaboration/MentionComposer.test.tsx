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

// jsdom reports a zeroed rect for every element; stub the editor's rect so the
// portal flip/clamp math has a realistic position to react to. jsdom's viewport is
// 768px tall.
function stubEditorRect(top: number, height = 40): void {
  const bottom = top + height;
  vi.spyOn(editor(), "getBoundingClientRect").mockReturnValue({
    x: 20,
    y: top,
    left: 20,
    right: 320,
    top,
    bottom,
    width: 300,
    height,
    toJSON: () => ({}),
  } as DOMRect);
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

  it("shows a card art thumbnail in the +card suggestions", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/members")) return json(members);
      if (url.includes("/api/cards"))
        return json({
          data: [
            {
              id: "cnc",
              name: "Command and Conquer",
              pitch: 1,
              imageUrl: "https://cards.test/cnc.webp",
            },
          ],
          nextCursor: null,
        });
      return json({}, 404);
    });
    renderComposer({ enableCardMentions: true });

    typeInEditor("try +comm");

    const suggestions = await screen.findByRole("list", { name: /card suggestions/i });
    const thumbnail = suggestions.querySelector("img");
    expect(thumbnail).toHaveAttribute("src", "https://cards.test/cnc.webp");
    // Decorative: the suggestion text already names the card.
    expect(thumbnail).toHaveAttribute("alt", "");
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

  it("portals the suggestion dropdown so an overflow-clipped ancestor cannot hide it", async () => {
    mockApi();
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <div data-testid="clip" style={{ overflow: "hidden" }}>
          <MentionComposer
            teamId="team-1"
            submitLabel="Save"
            placeholder="Describe the task…"
            ariaLabel="Task description"
            isPending={false}
            enableCardMentions
            onSubmit={vi.fn()}
          />
        </div>
      </QueryClientProvider>,
    );

    typeInEditor("try +comm");

    const suggestions = await screen.findByRole("list", { name: /card suggestions/i });
    // The dropdown must live outside the clipping container (portaled to the body),
    // otherwise the ancestor's overflow:hidden would clip it.
    expect(screen.getByTestId("clip")).not.toContainElement(suggestions);
    expect(document.body).toContainElement(suggestions);
    // userEvent needs a live pointer target so its cleanup doesn't warn.
    await user.click(within(suggestions).getByText("Command and Conquer"));
  });

  it("flips the suggestion dropdown above the editor when there is no room below", async () => {
    mockApi();
    renderComposer({ enableCardMentions: true });
    stubEditorRect(740); // near the bottom of the 768px-tall viewport

    typeInEditor("try +comm");

    const suggestions = await screen.findByRole("list", { name: /card suggestions/i });
    // Flipping up anchors the panel's bottom to the editor via a translateY(-100%).
    expect(suggestions.style.transform).toBe("translateY(-100%)");
  });

  it("opens the suggestion dropdown below the editor when there is room", async () => {
    mockApi();
    renderComposer({ enableCardMentions: true });
    stubEditorRect(100); // plenty of room below

    typeInEditor("try +comm");

    const suggestions = await screen.findByRole("list", { name: /card suggestions/i });
    expect(suggestions.style.transform).toBe("");
  });
});
