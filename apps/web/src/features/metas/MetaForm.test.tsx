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

describe("MetaForm", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an inverted window before calling the API", async () => {
    const posted: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      posted.push(init?.body);
      return json({});
    });
    const user = userEvent.setup();
    renderWithClient(<MetaForm teamId="team-1" onSaved={() => undefined} />);

    await user.type(screen.getByLabelText(/name/i), "Summer Season");
    await user.type(screen.getByLabelText(/start date/i), "2026-08-31");
    await user.type(screen.getByLabelText(/end date/i), "2026-07-01");
    await user.click(screen.getByRole("button", { name: /create meta/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/on or after the start date/i);
    expect(posted).toHaveLength(0);
  });

  it("submits a valid meta to the API", async () => {
    const bodies: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      bodies.push(init?.body ? JSON.parse(init.body as string) : undefined);
      return json({
        id: "meta-1",
        name: "Summer Season",
        startDate: "2026-07-01T00:00:00.000Z",
        endDate: "2026-08-31T00:00:00.000Z",
        description: "",
        archivedAt: null,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      });
    });
    const saved: unknown[] = [];
    const user = userEvent.setup();
    renderWithClient(<MetaForm teamId="team-1" onSaved={(meta) => saved.push(meta)} />);

    await user.type(screen.getByLabelText(/name/i), "Summer Season");
    await user.type(screen.getByLabelText(/start date/i), "2026-07-01");
    await user.type(screen.getByLabelText(/end date/i), "2026-08-31");
    await user.click(screen.getByRole("button", { name: /create meta/i }));

    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(bodies[0]).toMatchObject({
      name: "Summer Season",
      startDate: "2026-07-01",
      endDate: "2026-08-31",
    });
  });
});
