import { describe, expect, it } from "vitest";

import {
  attendanceSchema,
  attendanceStatusSchema,
  createEventSchema,
  eventListQuerySchema,
  eventSummarySchema,
  setAttendanceSchema,
  setTravelSchema,
  travelLegStatusSchema,
  updateEventSchema,
} from "./events.js";

describe("attendanceStatusSchema", () => {
  it("accepts the going/interested RSVP values", () => {
    for (const status of ["going", "interested"]) {
      expect(attendanceStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects the removed maybe/not_going values", () => {
    expect(attendanceStatusSchema.safeParse("maybe").success).toBe(false);
    expect(attendanceStatusSchema.safeParse("not_going").success).toBe(false);
  });
});

describe("createEventSchema", () => {
  const validInput = {
    name: "Calling: Sydney",
    date: "2026-09-12",
  };

  it("accepts a minimal valid event and defaults description; location stays optional", () => {
    const parsed = createEventSchema.parse(validInput);
    expect(parsed.name).toBe("Calling: Sydney");
    expect(parsed.description).toBe("");
    expect(parsed.location).toBeUndefined();
  });

  it("strips a meta link (events are isolated)", () => {
    const parsed = createEventSchema.parse({ ...validInput, metaId: "meta-1" });
    expect(parsed).not.toHaveProperty("metaId");
  });

  it("accepts an ISO datetime as well as a calendar date", () => {
    expect(() =>
      createEventSchema.parse({ ...validInput, date: "2026-09-12T09:00:00.000Z" }),
    ).not.toThrow();
  });

  it("rejects an unparseable date", () => {
    expect(() => createEventSchema.parse({ ...validInput, date: "not-a-date" })).toThrow();
  });

  it("rejects an empty name", () => {
    expect(() => createEventSchema.parse({ ...validInput, name: "   " })).toThrow();
  });

  it("strips server-controlled fields", () => {
    const parsed = createEventSchema.parse({
      ...validInput,
      teamId: "team-b",
      gameId: "riftbound",
      archivedAt: "2020-01-01",
    });
    expect(parsed).not.toHaveProperty("teamId");
    expect(parsed).not.toHaveProperty("gameId");
    expect(parsed).not.toHaveProperty("archivedAt");
  });
});

describe("updateEventSchema", () => {
  it("accepts a field change", () => {
    expect(updateEventSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
  });

  it("clears the location with null", () => {
    expect(updateEventSchema.parse({ location: null })).toEqual({ location: null });
  });

  it("rejects a meta link (events are isolated)", () => {
    expect(() => updateEventSchema.parse({ metaId: "meta-1" })).toThrow();
  });

  it("rejects an empty update", () => {
    expect(() => updateEventSchema.parse({})).toThrow();
  });

  it("rejects unknown keys", () => {
    expect(() => updateEventSchema.parse({ teamId: "team-b" })).toThrow();
  });
});

describe("setAttendanceSchema", () => {
  it("accepts a valid RSVP", () => {
    expect(setAttendanceSchema.parse({ status: "interested" })).toEqual({ status: "interested" });
  });

  it("rejects an invalid RSVP", () => {
    expect(() => setAttendanceSchema.parse({ status: "maybe" })).toThrow();
  });
});

describe("travelLegStatusSchema", () => {
  it("accepts the three leg states", () => {
    for (const status of ["sorted", "searching", "not_needed"]) {
      expect(travelLegStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects an unknown state", () => {
    expect(travelLegStatusSchema.safeParse("maybe").success).toBe(false);
  });
});

describe("setTravelSchema", () => {
  const sortedLeg = { status: "sorted" as const, detail: "Car with Sam" };
  const validPlan = {
    outboundTransport: sortedLeg,
    lodging: { status: "not_needed" as const },
    returnTransport: { status: "searching" as const },
  };

  it("accepts a full three-leg plan", () => {
    const parsed = setTravelSchema.parse(validPlan);
    expect(parsed.outboundTransport).toEqual(sortedLeg);
    expect(parsed.lodging.status).toBe("not_needed");
    expect(parsed.returnTransport.status).toBe("searching");
  });

  it("accepts a null (unspecified) leg status", () => {
    const parsed = setTravelSchema.parse({
      ...validPlan,
      lodging: { status: null },
    });
    expect(parsed.lodging.status).toBeNull();
  });

  it("makes the detail note optional", () => {
    expect(() =>
      setTravelSchema.parse({ ...validPlan, outboundTransport: { status: "sorted" } }),
    ).not.toThrow();
  });

  it("rejects a detail note longer than 200 characters", () => {
    expect(() =>
      setTravelSchema.parse({
        ...validPlan,
        outboundTransport: { status: "sorted", detail: "x".repeat(201) },
      }),
    ).toThrow();
  });

  it("requires all three legs to be present", () => {
    const missingLeg: Record<string, unknown> = { ...validPlan };
    delete missingLeg["lodging"];
    expect(setTravelSchema.safeParse(missingLeg).success).toBe(false);
  });
});

describe("attendanceSchema", () => {
  it("defaults travel to an all-unset plan when the field is absent (older API / stale cache)", () => {
    const parsed = attendanceSchema.parse({
      id: "attendance-1",
      eventId: "event-1",
      status: "going",
      user: { userId: "user-1", username: "sam", displayName: "Sam Mercier" },
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    });
    expect(parsed.travel).toEqual({
      outboundTransport: { status: null, detail: null },
      lodging: { status: null, detail: null },
      returnTransport: { status: null, detail: null },
    });
  });

  it("parses the nested three-leg travel plan", () => {
    const parsed = attendanceSchema.parse({
      id: "attendance-1",
      eventId: "event-1",
      status: "going",
      user: { userId: "user-1", username: "sam", displayName: "Sam Mercier" },
      travel: {
        outboundTransport: { status: "sorted", detail: "Driving" },
        lodging: { status: "searching", detail: null },
        returnTransport: { status: null, detail: null },
      },
      createdAt: "2026-07-12T00:00:00.000Z",
      updatedAt: "2026-07-12T00:00:00.000Z",
    });
    expect(parsed.travel.outboundTransport.detail).toBe("Driving");
    expect(parsed.travel.lodging.status).toBe("searching");
    expect(parsed.travel.returnTransport.status).toBeNull();
  });
});

describe("eventSummarySchema", () => {
  const validSummary = {
    id: "event-1",
    name: "Calling: Sydney",
    gameId: "flesh-and-blood",
    date: "2026-09-12T00:00:00.000Z",
    location: "Sydney",
    goingCount: 3,
    interestedCount: 1,
    archivedAt: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
  };

  it("carries the going/interested RSVP counts", () => {
    const parsed = eventSummarySchema.parse(validSummary);
    expect(parsed.goingCount).toBe(3);
    expect(parsed.interestedCount).toBe(1);
  });

  it("requires the RSVP counts to be present", () => {
    const withoutGoing: Record<string, unknown> = { ...validSummary };
    delete withoutGoing["goingCount"];
    expect(eventSummarySchema.safeParse(withoutGoing).success).toBe(false);
  });
});

describe("eventListQuerySchema", () => {
  it("defaults the limit", () => {
    expect(eventListQuerySchema.parse({})).toEqual({ limit: 20 });
  });
});
