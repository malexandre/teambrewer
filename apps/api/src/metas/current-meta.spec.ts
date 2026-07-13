import { describe, expect, it } from "vitest";

import { type CurrentMetaCandidate, resolveCurrentMeta } from "./current-meta.js";

/**
 * Table-driven coverage of the pure current-meta resolution rule: a meta is
 * current when today falls within `[startDate, endDate]`; overlaps resolve to the
 * latest `startDate`; boundaries are inclusive at UTC-day granularity; none → null.
 */

function candidate(
  id: string,
  startDate: string,
  endDate: string,
  createdAt = "2026-01-01T00:00:00.000Z",
): CurrentMetaCandidate {
  return {
    id,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    createdAt: new Date(createdAt),
  };
}

describe("resolveCurrentMeta", () => {
  it("returns null when there are no candidates", () => {
    expect(resolveCurrentMeta([], new Date("2026-07-13T12:00:00.000Z"))).toBeNull();
  });

  it("returns null when today falls outside every window", () => {
    const metas = [
      candidate("past", "2026-01-01", "2026-02-01"),
      candidate("future", "2026-09-01", "2026-10-01"),
    ];
    expect(resolveCurrentMeta(metas, new Date("2026-07-13T12:00:00.000Z"))).toBeNull();
  });

  it("returns the single meta whose window contains today", () => {
    const metas = [
      candidate("past", "2026-01-01", "2026-02-01"),
      candidate("current", "2026-07-01", "2026-08-01"),
      candidate("future", "2026-09-01", "2026-10-01"),
    ];
    expect(resolveCurrentMeta(metas, new Date("2026-07-13T12:00:00.000Z"))?.id).toBe("current");
  });

  it("picks the latest-starting meta when several windows overlap today", () => {
    const metas = [
      candidate("older", "2026-06-01", "2026-08-31"),
      candidate("newer", "2026-07-10", "2026-08-15"),
    ];
    expect(resolveCurrentMeta(metas, new Date("2026-07-13T12:00:00.000Z"))?.id).toBe("newer");
  });

  it("includes today at the start boundary (inclusive, whole-day)", () => {
    const metas = [candidate("boundary", "2026-07-13", "2026-08-01")];
    // Later in the day the meta whose window opens today is still current.
    expect(resolveCurrentMeta(metas, new Date("2026-07-13T23:59:59.000Z"))?.id).toBe("boundary");
  });

  it("includes today at the end boundary through the whole day", () => {
    const metas = [candidate("boundary", "2026-07-01", "2026-07-13")];
    // The end day is inclusive: at UTC-midday of the last day the meta is current
    // even though endDate is stored at 00:00Z of that day.
    expect(resolveCurrentMeta(metas, new Date("2026-07-13T12:00:00.000Z"))?.id).toBe("boundary");
  });

  it("breaks a same-startDate overlap by the most recently created meta", () => {
    const metas = [
      candidate("first", "2026-07-01", "2026-08-01", "2026-06-01T00:00:00.000Z"),
      candidate("second", "2026-07-01", "2026-08-15", "2026-06-05T00:00:00.000Z"),
    ];
    expect(resolveCurrentMeta(metas, new Date("2026-07-13T12:00:00.000Z"))?.id).toBe("second");
  });
});
