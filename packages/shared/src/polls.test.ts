import { describe, expect, it } from "vitest";

import {
  allowedNextPollStatuses,
  createPollSchema,
  isPollStatusTransitionAllowed,
  pollListQuerySchema,
  updatePollSchema,
} from "./polls.js";

describe("createPollSchema", () => {
  const base = {
    question: "Which deck for Nationals?",
    options: ["Fai", "Kano"],
  };

  it("accepts a poll with two options", () => {
    const parsed = createPollSchema.parse(base);
    expect(parsed.options).toEqual(["Fai", "Kano"]);
    expect(parsed.closesAt).toBeUndefined();
  });

  it("accepts an optional closesAt datetime", () => {
    const parsed = createPollSchema.parse({ ...base, closesAt: "2999-01-01T00:00:00.000Z" });
    expect(parsed.closesAt).toBe("2999-01-01T00:00:00.000Z");
  });

  it("rejects fewer than two options", () => {
    expect(() => createPollSchema.parse({ ...base, options: ["Fai"] })).toThrow();
  });

  it("rejects an empty options list", () => {
    expect(() => createPollSchema.parse({ ...base, options: [] })).toThrow();
  });

  it("rejects duplicate option labels", () => {
    expect(() => createPollSchema.parse({ ...base, options: ["Fai", "Fai"] })).toThrow();
  });

  it("rejects a blank option label", () => {
    expect(() => createPollSchema.parse({ ...base, options: ["Fai", "  "] })).toThrow();
  });

  it("rejects a malformed closesAt", () => {
    expect(() => createPollSchema.parse({ ...base, closesAt: "not-a-date" })).toThrow();
  });

  it("strips a client-supplied teamId / status", () => {
    const parsed = createPollSchema.parse({
      ...base,
      teamId: "team_forged",
      status: "closed",
    } as Record<string, unknown>);
    expect(parsed).not.toHaveProperty("teamId");
    expect(parsed).not.toHaveProperty("status");
  });
});

describe("updatePollSchema", () => {
  it("accepts a status-only change (close)", () => {
    expect(updatePollSchema.parse({ status: "closed" }).status).toBe("closed");
  });

  it("allows clearing closesAt with null", () => {
    expect(updatePollSchema.parse({ closesAt: null }).closesAt).toBeNull();
  });

  it("rejects an empty update", () => {
    expect(() => updatePollSchema.parse({})).toThrow();
  });

  it("rejects unknown keys", () => {
    expect(() => updatePollSchema.parse({ authorId: "user_2" })).toThrow();
  });
});

describe("poll status transitions", () => {
  it("permits open→closed and closed→open", () => {
    expect(isPollStatusTransitionAllowed("open", "closed")).toBe(true);
    expect(isPollStatusTransitionAllowed("closed", "open")).toBe(true);
  });

  it("rejects no-op transitions", () => {
    expect(isPollStatusTransitionAllowed("open", "open")).toBe(false);
    expect(isPollStatusTransitionAllowed("closed", "closed")).toBe(false);
  });

  it("lists the next statuses", () => {
    expect(allowedNextPollStatuses("open")).toEqual(["closed"]);
    expect(allowedNextPollStatuses("closed")).toEqual(["open"]);
  });
});

describe("pollListQuerySchema", () => {
  it("defaults the limit and accepts a status filter", () => {
    const parsed = pollListQuerySchema.parse({ status: "open" });
    expect(parsed.limit).toBe(20);
    expect(parsed.status).toBe("open");
  });

  it("coerces a string limit", () => {
    expect(pollListQuerySchema.parse({ limit: "5" }).limit).toBe(5);
  });
});
