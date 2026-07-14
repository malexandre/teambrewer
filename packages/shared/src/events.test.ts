import { describe, expect, it } from "vitest";

import {
  attendanceStatusSchema,
  createEventSchema,
  eventListQuerySchema,
  eventSummarySchema,
  setAttendanceSchema,
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

  it("accepts a minimal valid event and defaults description; location/meta stay optional", () => {
    const parsed = createEventSchema.parse(validInput);
    expect(parsed.name).toBe("Calling: Sydney");
    expect(parsed.description).toBe("");
    expect(parsed.location).toBeUndefined();
    expect(parsed.metaId).toBeUndefined();
  });

  it("accepts an optional meta link", () => {
    const parsed = createEventSchema.parse({ ...validInput, metaId: "meta-1" });
    expect(parsed.metaId).toBe("meta-1");
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

  it("clears the location and meta with null", () => {
    expect(updateEventSchema.parse({ location: null, metaId: null })).toEqual({
      location: null,
      metaId: null,
    });
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

describe("eventSummarySchema", () => {
  const validSummary = {
    id: "event-1",
    name: "Calling: Sydney",
    gameId: "flesh-and-blood",
    metaId: null,
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
  it("defaults the limit and allows an optional meta filter", () => {
    expect(eventListQuerySchema.parse({})).toEqual({ limit: 20 });
    const filtered = eventListQuerySchema.parse({ metaId: "meta-1" });
    expect(filtered.metaId).toBe("meta-1");
  });
});
