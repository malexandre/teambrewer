import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AttendanceControl } from "./AttendanceControl";

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** Mock the current user, the roster, and the RSVP upsert the control depends on. */
function mockApi(options: { myStatus?: string; onPut?: (body: unknown) => void } = {}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url.includes("/api/me")) {
      return json({
        id: "user-1",
        username: "alpha",
        displayName: "Alpha Member",
        isInstanceAdmin: false,
        authMethod: "password_totp",
        totpEnabled: true,
        discordUserId: null,
        discordUsername: null,
      });
    }
    if (url.includes("/api/events/event-1/attendance/me") && method === "PUT") {
      const body: unknown = init?.body ? JSON.parse(init.body as string) : {};
      options.onPut?.(body);
      return json({
        id: "att-1",
        eventId: "event-1",
        status: (body as { status: string }).status,
        user: { userId: "user-1", username: "alpha", displayName: "Alpha Member" },
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      });
    }
    if (url.includes("/api/events/event-1/attendance")) {
      return json({
        data: options.myStatus
          ? [
              {
                id: "att-1",
                eventId: "event-1",
                status: options.myStatus,
                user: { userId: "user-1", username: "alpha", displayName: "Alpha Member" },
                createdAt: "2026-07-12T00:00:00.000Z",
                updatedAt: "2026-07-12T00:00:00.000Z",
              },
            ]
          : [],
      });
    }
    return json({}, 404);
  });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AttendanceControl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reflects the current user's RSVP as the pressed toggle", async () => {
    mockApi({ myStatus: "going" });
    renderWithClient(<AttendanceControl teamId="team-1" eventId="event-1" />);

    const goingButton = await screen.findByRole("button", { name: /^going$/i });
    await vi.waitFor(() => expect(goingButton).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: /^interested$/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("sends my RSVP when a status is chosen", async () => {
    const puts: unknown[] = [];
    mockApi({ onPut: (body) => puts.push(body) });
    const user = userEvent.setup();
    renderWithClient(<AttendanceControl teamId="team-1" eventId="event-1" />);

    await user.click(await screen.findByRole("button", { name: /^interested$/i }));
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ status: "interested" });
  });
});
