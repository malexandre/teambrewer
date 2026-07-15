import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "./format-relative-time";

// A fixed "now" keeps these assertions free of any wall-clock dependence.
const now = new Date("2026-07-15T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it("reads as 'just now' under a minute", () => {
    expect(formatRelativeTime("2026-07-15T11:59:30.000Z", now)).toBe("just now");
  });

  it("counts whole minutes within the hour", () => {
    expect(formatRelativeTime("2026-07-15T11:55:00.000Z", now)).toBe("5m ago");
  });

  it("counts whole hours within the day", () => {
    expect(formatRelativeTime("2026-07-15T10:00:00.000Z", now)).toBe("2h ago");
  });

  it("counts whole days within the week", () => {
    expect(formatRelativeTime("2026-07-12T12:00:00.000Z", now)).toBe("3d ago");
  });

  it("falls back to a calendar date beyond a week", () => {
    const formatted = formatRelativeTime("2026-06-01T12:00:00.000Z", now);
    expect(formatted).not.toMatch(/ago/);
    expect(formatted).toBe(new Date("2026-06-01T12:00:00.000Z").toLocaleDateString());
  });
});
