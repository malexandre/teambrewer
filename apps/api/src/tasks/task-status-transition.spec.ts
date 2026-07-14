import type { TaskStatus } from "@teambrewer/shared";
import { describe, expect, it } from "vitest";

import {
  allowedNextStatuses,
  assertReportPresent,
  assertTaskStatusTransition,
} from "./task-status-transition.js";

/**
 * The task lifecycle (docs/features/tasks.md) is a free kanban: any status may move to
 * any *other* status; only a no-op (from === to) is rejected. This table is the single
 * source of truth for the tests below.
 */
const ALL_STATUSES: TaskStatus[] = ["proposed", "assigned", "finished", "abandoned"];

const ALLOWED: Record<TaskStatus, TaskStatus[]> = {
  proposed: ["assigned", "finished", "abandoned"],
  assigned: ["proposed", "finished", "abandoned"],
  finished: ["proposed", "assigned", "abandoned"],
  abandoned: ["proposed", "assigned", "finished"],
};

describe("assertTaskStatusTransition", () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const isAllowed = ALLOWED[from].includes(to);
      it(`${isAllowed ? "allows" : "rejects"} ${from} -> ${to}`, () => {
        if (isAllowed) {
          expect(() => assertTaskStatusTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertTaskStatusTransition(from, to)).toThrow();
        }
      });
    }
  }

  it("rejects a no-op transition (from === to) for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(() => assertTaskStatusTransition(status, status)).toThrow();
    }
  });
});

describe("allowedNextStatuses", () => {
  it("returns every other status for each state (free kanban)", () => {
    expect(allowedNextStatuses("proposed")).toEqual(["assigned", "finished", "abandoned"]);
    expect(allowedNextStatuses("assigned")).toEqual(["proposed", "finished", "abandoned"]);
    expect(allowedNextStatuses("finished")).toEqual(["proposed", "assigned", "abandoned"]);
    expect(allowedNextStatuses("abandoned")).toEqual(["proposed", "assigned", "finished"]);
  });
});

describe("assertReportPresent", () => {
  it("requires a non-empty report when finishing a task", () => {
    expect(() => assertReportPresent("finished", "")).toThrow();
    expect(() => assertReportPresent("finished", "   ")).toThrow();
    expect(() => assertReportPresent("finished", "went 7-2")).not.toThrow();
  });

  it("does not require a report for non-finishing statuses", () => {
    expect(() => assertReportPresent("proposed", "")).not.toThrow();
    expect(() => assertReportPresent("assigned", "")).not.toThrow();
    expect(() => assertReportPresent("abandoned", "")).not.toThrow();
  });
});
