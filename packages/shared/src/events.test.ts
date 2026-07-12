import { describe, expect, it } from "vitest";

import {
  allowedNextEventStatuses,
  attendanceStatusSchema,
  createEventSchema,
  createGauntletEntrySchema,
  eventImportanceRank,
  eventImportanceSchema,
  eventListQuerySchema,
  eventStatusSchema,
  eventStatusTransitions,
  isEventStatusTransitionAllowed,
  setAttendanceSchema,
  updateEventSchema,
  updateGauntletEntrySchema,
} from "./events.js";

describe("event enums", () => {
  it("accepts every valid status", () => {
    for (const status of ["upcoming", "active", "completed", "archived"]) {
      expect(eventStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects an unknown status", () => {
    expect(() => eventStatusSchema.parse("cancelled")).toThrow();
  });

  it("accepts every valid importance", () => {
    for (const importance of ["local", "regional", "national", "major"]) {
      expect(eventImportanceSchema.parse(importance)).toBe(importance);
    }
  });

  it("rejects an unknown importance", () => {
    expect(() => eventImportanceSchema.parse("worlds")).toThrow();
  });

  it("accepts every valid attendance status", () => {
    for (const status of ["going", "maybe", "not_going"]) {
      expect(attendanceStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects an unknown attendance status", () => {
    expect(() => attendanceStatusSchema.parse("perhaps")).toThrow();
  });
});

describe("event importance ordinal", () => {
  it("ranks importance from local (lowest) to major (highest)", () => {
    expect(eventImportanceRank.local).toBeLessThan(eventImportanceRank.regional);
    expect(eventImportanceRank.regional).toBeLessThan(eventImportanceRank.national);
    expect(eventImportanceRank.national).toBeLessThan(eventImportanceRank.major);
  });
});

describe("event status transitions", () => {
  it("permits the forward lifecycle and cancellations", () => {
    expect(isEventStatusTransitionAllowed("upcoming", "active")).toBe(true);
    expect(isEventStatusTransitionAllowed("upcoming", "archived")).toBe(true);
    expect(isEventStatusTransitionAllowed("active", "completed")).toBe(true);
    expect(isEventStatusTransitionAllowed("active", "archived")).toBe(true);
    expect(isEventStatusTransitionAllowed("completed", "archived")).toBe(true);
  });

  it("rejects illegal transitions and no-ops", () => {
    expect(isEventStatusTransitionAllowed("upcoming", "completed")).toBe(false);
    expect(isEventStatusTransitionAllowed("completed", "active")).toBe(false);
    expect(isEventStatusTransitionAllowed("archived", "upcoming")).toBe(false);
    expect(isEventStatusTransitionAllowed("active", "active")).toBe(false);
  });

  it("exposes allowed next statuses without the current one", () => {
    expect(allowedNextEventStatuses("upcoming")).toEqual(["active", "archived"]);
    expect(allowedNextEventStatuses("archived")).toEqual([]);
    expect(allowedNextEventStatuses("active")).not.toContain("active");
  });

  it("returns a fresh mutable copy from allowedNextEventStatuses", () => {
    const next = allowedNextEventStatuses("upcoming");
    next.pop();
    expect(eventStatusTransitions.upcoming).toEqual(["active", "archived"]);
  });
});

describe("createEventSchema", () => {
  const validInput = {
    name: "Calling: Sydney",
    formatId: "format-cc",
    importance: "national",
    date: "2026-09-12",
  };

  it("accepts a minimal valid event and defaults description/location", () => {
    const parsed = createEventSchema.parse(validInput);
    expect(parsed.name).toBe("Calling: Sydney");
    expect(parsed.description).toBe("");
    expect(parsed.location).toBeUndefined();
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

  it("rejects a missing format", () => {
    expect(() => createEventSchema.parse({ ...validInput, formatId: "" })).toThrow();
  });

  it("strips server-controlled fields", () => {
    const parsed = createEventSchema.parse({
      ...validInput,
      teamId: "team-b",
      status: "completed",
      archivedAt: "2020-01-01",
    });
    expect(parsed).not.toHaveProperty("teamId");
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("archivedAt");
  });
});

describe("updateEventSchema", () => {
  it("accepts a status advance", () => {
    expect(updateEventSchema.parse({ status: "active" })).toEqual({ status: "active" });
  });

  it("rejects an empty update", () => {
    expect(() => updateEventSchema.parse({})).toThrow();
  });

  it("rejects unknown keys", () => {
    expect(() => updateEventSchema.parse({ teamId: "team-b" })).toThrow();
  });
});

describe("createGauntletEntrySchema", () => {
  it("accepts exactly one target form (reference deck)", () => {
    const parsed = createGauntletEntrySchema.parse({
      referenceDeckId: "deck-1",
      expectedMetaShare: 25,
    });
    expect(parsed.referenceDeckId).toBe("deck-1");
    expect(parsed.notes).toBe("");
  });

  it("accepts a hero target and an archetype-label target", () => {
    expect(() =>
      createGauntletEntrySchema.parse({ heroId: "hero-1", expectedMetaShare: 10 }),
    ).not.toThrow();
    expect(() =>
      createGauntletEntrySchema.parse({ archetypeLabel: "Aggro Red", expectedMetaShare: 10 }),
    ).not.toThrow();
  });

  it("rejects zero target forms", () => {
    expect(() => createGauntletEntrySchema.parse({ expectedMetaShare: 10 })).toThrow();
  });

  it("rejects two target forms", () => {
    expect(() =>
      createGauntletEntrySchema.parse({
        heroId: "hero-1",
        archetypeLabel: "Aggro Red",
        expectedMetaShare: 10,
      }),
    ).toThrow();
  });

  it.each([
    [-1, true],
    [0, false],
    [100, false],
    [101, true],
    [12.5, true],
  ])("validates expectedMetaShare %s (throws=%s)", (share, shouldThrow) => {
    const run = () =>
      createGauntletEntrySchema.parse({ heroId: "hero-1", expectedMetaShare: share });
    if (shouldThrow) {
      expect(run).toThrow();
    } else {
      expect(run).not.toThrow();
    }
  });
});

describe("updateGauntletEntrySchema", () => {
  it("accepts a share change", () => {
    expect(updateGauntletEntrySchema.parse({ expectedMetaShare: 30 })).toEqual({
      expectedMetaShare: 30,
    });
  });

  it("rejects an empty update", () => {
    expect(() => updateGauntletEntrySchema.parse({})).toThrow();
  });

  it("rejects attempts to change the target form (immutable)", () => {
    expect(() => updateGauntletEntrySchema.parse({ heroId: "hero-2" })).toThrow();
  });
});

describe("setAttendanceSchema", () => {
  it("accepts a valid RSVP", () => {
    expect(setAttendanceSchema.parse({ status: "going" })).toEqual({ status: "going" });
  });

  it("rejects an invalid RSVP", () => {
    expect(() => setAttendanceSchema.parse({ status: "yes" })).toThrow();
  });
});

describe("eventListQuerySchema", () => {
  it("defaults the limit and coerces string numbers", () => {
    expect(eventListQuerySchema.parse({}).limit).toBe(20);
    expect(eventListQuerySchema.parse({ limit: "5" }).limit).toBe(5);
  });

  it("rejects an over-large limit", () => {
    expect(() => eventListQuerySchema.parse({ limit: "500" })).toThrow();
  });

  it("accepts status/formatId/importance filters", () => {
    const parsed = eventListQuerySchema.parse({
      status: "active",
      formatId: "format-cc",
      importance: "major",
    });
    expect(parsed.status).toBe("active");
    expect(parsed.formatId).toBe("format-cc");
    expect(parsed.importance).toBe("major");
  });
});
