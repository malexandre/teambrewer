import type { Attendance, TravelLegStatus } from "@teambrewer/shared";
import { describe, expect, it } from "vitest";

import {
  formatEventDate,
  summarizeTravelNeeds,
  TRAVEL_LEG_STATUS_LABELS,
  TRAVEL_LEGS,
  travelLegOptionValue,
  travelNeedsForPlan,
} from "./event-display";

/** Build a roster entry with a given RSVP and per-leg travel statuses. */
function attendee(
  status: "going" | "interested",
  legs: {
    outbound?: TravelLegStatus | null;
    lodging?: TravelLegStatus | null;
    ret?: TravelLegStatus | null;
  } = {},
): Attendance {
  return {
    id: `attendance-${Math.random()}`,
    eventId: "event-1",
    status,
    user: { userId: `user-${Math.random()}`, username: "member", displayName: "A Member" },
    travel: {
      outboundTransport: { status: legs.outbound ?? null, detail: null },
      lodging: { status: legs.lodging ?? null, detail: null },
      returnTransport: { status: legs.ret ?? null, detail: null },
    },
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  };
}

describe("formatEventDate", () => {
  it("renders the stored UTC calendar date without a timezone shift", () => {
    // The server stores/serializes an event date at UTC midnight. A naive
    // `new Date(iso).toLocaleDateString()` would render the previous day for a
    // viewer west of UTC; formatting in UTC must keep the day the user picked.
    const isoAtUtcMidnight = "2026-09-12T00:00:00.000Z";

    // Sanity: the instant's UTC calendar day is the 12th (regardless of host TZ).
    expect(
      new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date(isoAtUtcMidnight)),
    ).toBe("2026-09-12");

    const formatted = formatEventDate(isoAtUtcMidnight);
    expect(formatted).toContain("2026");
    expect(formatted).toMatch(/\b12\b/);
  });
});

describe("travel display metadata", () => {
  it("labels each leg status", () => {
    expect(TRAVEL_LEG_STATUS_LABELS.sorted).toBe("Sorted");
    expect(TRAVEL_LEG_STATUS_LABELS.searching).toBe("Still looking");
    expect(TRAVEL_LEG_STATUS_LABELS.not_needed).toBe("Not needed");
  });

  it("describes the three legs in display order", () => {
    expect(TRAVEL_LEGS.map((leg) => leg.key)).toEqual([
      "outboundTransport",
      "lodging",
      "returnTransport",
    ]);
  });

  it("offers transport methods for travel legs and lodging methods for lodging", () => {
    const [outbound, lodging] = TRAVEL_LEGS;
    expect(outbound!.options.map((option) => option.value)).toEqual([
      "plane",
      "car",
      "train",
      "bus",
      "other",
      "searching",
      "not_needed",
    ]);
    expect(lodging!.options.map((option) => option.value)).toEqual([
      "airbnb",
      "hotel",
      "other",
      "searching",
      "not_needed",
    ]);
  });
});

describe("travelLegOptionValue", () => {
  const transportOptions = TRAVEL_LEGS[0]!.options;

  it("maps a sorted method detail back to its option value", () => {
    expect(travelLegOptionValue("sorted", "Car", transportOptions)).toBe("car");
  });

  it("falls back to 'other' for an unrecognized/legacy sorted detail", () => {
    expect(travelLegOptionValue("sorted", "Rideshare with Sam", transportOptions)).toBe("other");
  });

  it("maps searching, not_needed, and unset to their own values", () => {
    expect(travelLegOptionValue("searching", null, transportOptions)).toBe("searching");
    expect(travelLegOptionValue("not_needed", null, transportOptions)).toBe("not_needed");
    expect(travelLegOptionValue(null, null, transportOptions)).toBe("searching");
  });
});

describe("travelNeedsForPlan", () => {
  it("flags transport when either travel leg is still searching", () => {
    expect(
      travelNeedsForPlan(
        attendee("going", { outbound: "searching", lodging: "not_needed", ret: "not_needed" })
          .travel,
      ),
    ).toEqual({ needsTransport: true, needsLodging: false });
    expect(
      travelNeedsForPlan(
        attendee("going", { outbound: "not_needed", lodging: "not_needed", ret: "searching" })
          .travel,
      ),
    ).toEqual({ needsTransport: true, needsLodging: false });
  });

  it("flags lodging only when the lodging leg is searching", () => {
    expect(
      travelNeedsForPlan(
        attendee("going", { outbound: "not_needed", lodging: "searching", ret: "not_needed" })
          .travel,
      ),
    ).toEqual({ needsTransport: false, needsLodging: true });
  });

  it("flags nothing when every leg is sorted or not needed", () => {
    expect(
      travelNeedsForPlan(
        attendee("going", { outbound: "sorted", lodging: "not_needed", ret: "sorted" }).travel,
      ),
    ).toEqual({ needsTransport: false, needsLodging: false });
  });

  it("treats an unset leg as still looking (the default for anyone going)", () => {
    expect(travelNeedsForPlan(attendee("going").travel)).toEqual({
      needsTransport: true,
      needsLodging: true,
    });
  });
});

describe("summarizeTravelNeeds", () => {
  it("tallies transport and lodging needs across going members only", () => {
    const roster: Attendance[] = [
      attendee("going", { outbound: "searching", lodging: "not_needed", ret: "sorted" }),
      attendee("going", { outbound: "sorted", lodging: "searching", ret: "searching" }),
      attendee("going", { outbound: "sorted", lodging: "sorted", ret: "sorted" }),
      // Interested members never count, even if their legs look unmet.
      attendee("interested", { outbound: "searching", lodging: "searching" }),
    ];
    expect(summarizeTravelNeeds(roster)).toEqual({ transportCount: 2, lodgingCount: 1 });
  });

  it("returns zeroes for an empty roster", () => {
    expect(summarizeTravelNeeds([])).toEqual({ transportCount: 0, lodgingCount: 0 });
  });
});
