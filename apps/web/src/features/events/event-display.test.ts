import { describe, expect, it } from "vitest";

import { formatEventDate } from "./event-display";

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
