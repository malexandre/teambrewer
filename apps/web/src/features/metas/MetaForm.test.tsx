import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MetaForm } from "./MetaForm";

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const formatsPayload = {
  data: [
    {
      id: "fmt-cc",
      gameId: "flesh-and-blood",
      key: "cc",
      name: "Classic Constructed",
      isConstructed: true,
    },
    {
      id: "fmt-blitz",
      gameId: "flesh-and-blood",
      key: "blitz",
      name: "Blitz",
      isConstructed: false,
    },
  ],
};

describe("MetaForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an inverted window before calling the API", async () => {
    const posted: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/formats")) return json(formatsPayload);
      posted.push(init?.body);
      return json({});
    });
    const user = userEvent.setup();
    renderWithClient(<MetaForm teamId="team-1" onSaved={() => undefined} />);

    await user.type(screen.getByLabelText(/name/i), "Summer Season");
    await user.selectOptions(await screen.findByLabelText(/format/i), "fmt-cc");
    await user.type(screen.getByLabelText(/start date/i), "2026-08-31");
    await user.type(screen.getByLabelText(/end date/i), "2026-07-01");
    await user.click(screen.getByRole("button", { name: /create meta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/on or after the start date/i);
    expect(posted).toHaveLength(0);
  });

  it("requires a format before calling the API", async () => {
    const posted: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/formats")) return json(formatsPayload);
      posted.push(init?.body);
      return json({});
    });
    const user = userEvent.setup();
    renderWithClient(<MetaForm teamId="team-1" onSaved={() => undefined} />);

    await user.type(screen.getByLabelText(/name/i), "Summer Season");
    await user.type(screen.getByLabelText(/start date/i), "2026-07-01");
    await user.type(screen.getByLabelText(/end date/i), "2026-08-31");
    await user.click(screen.getByRole("button", { name: /create meta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/a format is required/i);
    expect(posted).toHaveLength(0);
  });

  it("submits a valid meta (with its format) to the API", async () => {
    const bodies: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/formats")) return json(formatsPayload);
      bodies.push(init?.body ? JSON.parse(init.body as string) : undefined);
      return json({
        id: "meta-1",
        name: "Summer Season",
        formatId: "fmt-cc",
        formatName: "Classic Constructed",
        startDate: "2026-07-01T00:00:00.000Z",
        endDate: "2026-08-31T00:00:00.000Z",
        description: "",
        archivedAt: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        changeReason: null,
        changeReasonHeroId: null,
        changeReasonImageUrl: null,
      });
    });
    const saved: unknown[] = [];
    const user = userEvent.setup();
    renderWithClient(<MetaForm teamId="team-1" onSaved={(meta) => saved.push(meta)} />);

    await user.type(screen.getByLabelText(/name/i), "Summer Season");
    await user.selectOptions(await screen.findByLabelText(/format/i), "fmt-cc");
    await user.type(screen.getByLabelText(/start date/i), "2026-07-01");
    await user.type(screen.getByLabelText(/end date/i), "2026-08-31");
    await user.click(screen.getByRole("button", { name: /create meta/i }));

    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      name: "Summer Season",
      formatId: "fmt-cc",
      startDate: "2026-07-01",
      endDate: "2026-08-31",
    });
  });

  const heroesPayload = {
    data: [
      {
        id: "hero-dori",
        name: "Dorinthea",
        classes: ["Warrior"],
        talents: [],
        startingLife: 20,
        imageUrl: "https://img.example/dori.png",
        legalFormatKeys: ["cc"],
      },
    ],
  };
  const gameConfigPayload = { gameId: "flesh-and-blood", identityLabel: "Hero", defaultBestOf: 3 };

  function mockMetaFetch(bodies: unknown[]) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/formats")) return json(formatsPayload);
      if (url.includes("/api/heroes")) return json(heroesPayload);
      if (url.includes("/api/game-config")) return json(gameConfigPayload);
      bodies.push(init?.body ? JSON.parse(init.body as string) : undefined);
      return json({
        id: "meta-1",
        name: "Summer Season",
        formatId: "fmt-cc",
        formatName: "Classic Constructed",
        startDate: "2026-07-01T00:00:00.000Z",
        endDate: "2026-08-31T00:00:00.000Z",
        description: "",
        archivedAt: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        changeReason: null,
        changeReasonHeroId: null,
        changeReasonImageUrl: null,
      });
    });
  }

  async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/name/i), "Summer Season");
    await user.selectOptions(await screen.findByLabelText(/format/i), "fmt-cc");
    await user.type(screen.getByLabelText(/start date/i), "2026-07-01");
    await user.type(screen.getByLabelText(/end date/i), "2026-08-31");
  }

  it("shows the hero picker for a Living Legend reason and submits the hero", async () => {
    const bodies: unknown[] = [];
    mockMetaFetch(bodies);
    const user = userEvent.setup();
    renderWithClient(<MetaForm teamId="team-1" onSaved={() => undefined} />);

    await fillRequiredFields(user);
    await user.selectOptions(screen.getByLabelText(/why a new meta/i), "living_legend");
    await user.selectOptions(await screen.findByLabelText(/retiring hero/i), "hero-dori");
    await user.click(screen.getByRole("button", { name: /create meta/i }));

    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      changeReason: "living_legend",
      changeReasonHeroId: "hero-dori",
    });
  });

  it("shows a URL field for a product-release reason and submits the pasted URL", async () => {
    const bodies: unknown[] = [];
    mockMetaFetch(bodies);
    const user = userEvent.setup();
    renderWithClient(<MetaForm teamId="team-1" onSaved={() => undefined} />);

    await fillRequiredFields(user);
    await user.selectOptions(screen.getByLabelText(/why a new meta/i), "product_release");
    await user.type(
      await screen.findByLabelText(/marketing image url/i),
      "https://fabtcg.com/heavy-hitters.png",
    );
    await user.click(screen.getByRole("button", { name: /create meta/i }));

    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      changeReason: "product_release",
      changeReasonImageUrl: "https://fabtcg.com/heavy-hitters.png",
    });
  });

  it("submits a ban-list reason with no extra detail", async () => {
    const bodies: unknown[] = [];
    mockMetaFetch(bodies);
    const user = userEvent.setup();
    renderWithClient(<MetaForm teamId="team-1" onSaved={() => undefined} />);

    await fillRequiredFields(user);
    await user.selectOptions(screen.getByLabelText(/why a new meta/i), "ban_list");
    await user.click(screen.getByRole("button", { name: /create meta/i }));

    await vi.waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ changeReason: "ban_list" });
    expect(screen.queryByLabelText(/retiring hero/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/marketing image url/i)).not.toBeInTheDocument();
  });

  it("rejects a non-http(s) product image URL before calling the API", async () => {
    const bodies: unknown[] = [];
    mockMetaFetch(bodies);
    const user = userEvent.setup();
    renderWithClient(<MetaForm teamId="team-1" onSaved={() => undefined} />);

    await fillRequiredFields(user);
    await user.selectOptions(screen.getByLabelText(/why a new meta/i), "product_release");
    await user.type(await screen.findByLabelText(/marketing image url/i), "ftp://fabtcg.com/x.png");
    await user.click(screen.getByRole("button", { name: /create meta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/http/i);
    expect(bodies).toHaveLength(0);
  });
});
