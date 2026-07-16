import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Attendance, TravelLegStatus } from "@teambrewer/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AttendanceControl } from "./AttendanceControl";

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const emptyTravel = () => ({
  outboundTransport: { status: null, detail: null },
  lodging: { status: null, detail: null },
  returnTransport: { status: null, detail: null },
});

/** Build a roster entry with an RSVP and optional per-leg travel statuses. */
function entry(overrides: {
  id: string;
  userId: string;
  displayName: string;
  username?: string;
  status: "going" | "interested";
  legs?: {
    outbound?: TravelLegStatus | null;
    lodging?: TravelLegStatus | null;
    ret?: TravelLegStatus | null;
  };
}): Attendance {
  return {
    id: overrides.id,
    eventId: "event-1",
    status: overrides.status,
    user: {
      userId: overrides.userId,
      username: overrides.username ?? overrides.displayName.toLowerCase(),
      displayName: overrides.displayName,
    },
    travel: {
      outboundTransport: { status: overrides.legs?.outbound ?? null, detail: null },
      lodging: { status: overrides.legs?.lodging ?? null, detail: null },
      returnTransport: { status: overrides.legs?.ret ?? null, detail: null },
    },
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  };
}

/** Mock the current user, the roster, and the RSVP/travel writes the control depends on. */
function mockApi(
  options: {
    roster?: Attendance[];
    myStatus?: "going" | "interested";
    onRsvpPut?: (body: unknown) => void;
    onTravelPut?: (body: unknown) => void;
  } = {},
) {
  const roster =
    options.roster ??
    (options.myStatus
      ? [
          entry({
            id: "att-1",
            userId: "user-1",
            displayName: "Alpha Member",
            username: "alpha",
            status: options.myStatus,
          }),
        ]
      : []);

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
    if (url.includes("/api/events/event-1/attendance/me/travel") && method === "PUT") {
      const body: unknown = init?.body ? JSON.parse(init.body as string) : {};
      options.onTravelPut?.(body);
      const mine = roster.find((candidate) => candidate.user.userId === "user-1");
      return json({ ...(mine ?? roster[0]), travel: emptyTravel() });
    }
    if (url.includes("/api/events/event-1/attendance/me") && method === "PUT") {
      const body: unknown = init?.body ? JSON.parse(init.body as string) : {};
      options.onRsvpPut?.(body);
      return json({
        id: "att-1",
        eventId: "event-1",
        status: (body as { status: string }).status,
        user: { userId: "user-1", username: "alpha", displayName: "Alpha Member" },
        travel: emptyTravel(),
        createdAt: "2026-07-12T00:00:00.000Z",
        updatedAt: "2026-07-12T00:00:00.000Z",
      });
    }
    if (url.includes("/api/events/event-1/attendance")) {
      return json({ data: roster });
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
    mockApi({ onRsvpPut: (body) => puts.push(body) });
    const user = userEvent.setup();
    renderWithClient(<AttendanceControl teamId="team-1" eventId="event-1" />);

    await user.click(await screen.findByRole("button", { name: /^interested$/i }));
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ status: "interested" });
  });

  it("groups the roster and flags who still needs help", async () => {
    mockApi({
      roster: [
        entry({
          id: "att-1",
          userId: "user-1",
          displayName: "Alpha Member",
          status: "going",
          legs: { outbound: "searching", lodging: "not_needed", ret: "searching" },
        }),
        entry({
          id: "att-2",
          userId: "user-2",
          displayName: "Beta Member",
          status: "going",
          legs: { outbound: "sorted", lodging: "sorted", ret: "sorted" },
        }),
        entry({
          id: "att-3",
          userId: "user-3",
          displayName: "Gamma Member",
          status: "interested",
        }),
      ],
    });
    renderWithClient(<AttendanceControl teamId="team-1" eventId="event-1" />);

    // The needs strip tallies the one going member still looking for transport,
    // and shows no lodging pill (the only lodging leg is sorted / not needed).
    expect(await screen.findByText(/1 needs transport/i)).toBeInTheDocument();
    expect(screen.queryByText(/needs? lodging/i)).not.toBeInTheDocument();

    // Interested members are chips, not tickets — they appear under the Interested group.
    expect(screen.getByRole("heading", { name: /going/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /interested/i })).toBeInTheDocument();
    expect(screen.getByText("Gamma Member")).toBeInTheDocument();
  });

  it("defaults every leg to still looking when going", async () => {
    // A fresh going member (no travel set) reads as still looking on all three legs, so
    // the needs strip flags both transport and lodging.
    mockApi({ myStatus: "going" });
    renderWithClient(<AttendanceControl teamId="team-1" eventId="event-1" />);

    expect(await screen.findByText(/1 needs transport/i)).toBeInTheDocument();
    expect(screen.getByText(/1 needs lodging/i)).toBeInTheDocument();
  });

  it("auto-saves my trip on each dropdown change (no save button)", async () => {
    const travelPuts: unknown[] = [];
    mockApi({ myStatus: "going", onTravelPut: (body) => travelPuts.push(body) });
    const user = userEvent.setup();
    renderWithClient(<AttendanceControl teamId="team-1" eventId="event-1" />);

    // The "Your trip" editor is visible because I'm going; each leg is one select whose
    // concrete methods map to a sorted status + the method label as the detail. There is
    // no save button — changing a dropdown saves immediately.
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();

    await user.selectOptions(await screen.findByLabelText("Getting there"), "car");
    await vi.waitFor(() => expect(travelPuts).toHaveLength(1));
    expect(travelPuts[0]).toEqual({
      outboundTransport: { status: "sorted", detail: "Car" },
      lodging: { status: "searching" },
      returnTransport: { status: "searching" },
    });

    await user.selectOptions(screen.getByLabelText("Lodging"), "not_needed");
    await vi.waitFor(() => expect(travelPuts).toHaveLength(2));
    expect(travelPuts[1]).toEqual({
      outboundTransport: { status: "sorted", detail: "Car" },
      lodging: { status: "not_needed" },
      returnTransport: { status: "searching" },
    });
  });

  it("collapses and expands the trip editor", async () => {
    mockApi({ myStatus: "going" });
    const user = userEvent.setup();
    renderWithClient(<AttendanceControl teamId="team-1" eventId="event-1" />);

    expect(await screen.findByLabelText("Getting there")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /your trip/i }));
    expect(screen.queryByLabelText("Getting there")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /your trip/i }));
    expect(screen.getByLabelText("Getting there")).toBeInTheDocument();
  });

  it("does not show the trip editor when only interested", async () => {
    mockApi({ myStatus: "interested" });
    renderWithClient(<AttendanceControl teamId="team-1" eventId="event-1" />);

    await screen.findByRole("button", { name: /^interested$/i });
    expect(screen.queryByText(/your trip/i)).not.toBeInTheDocument();
  });
});
