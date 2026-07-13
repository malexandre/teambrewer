import type { TaskStatus } from "@teambrewer/shared";
import { describe, expect, it } from "vitest";

import {
  allowedNextStatuses,
  assertReportPresent,
  assertTaskStatusTransition,
} from "./task-status-transition.js";

/**
 * The task lifecycle (docs/features/tasks.md): `proposed → [assigned, abandoned]`,
 * `assigned → [finished, abandoned]`; `finished` and `abandoned` are terminal. Every
 * other move — including a no-op — is rejected. This table is the single source of
 * truth for the tests below.
 */
const ALL_STATUSES: TaskStatus[] = ["proposed", "assigned", "finished", "abandoned"];

const ALLOWED: Record<TaskStatus, TaskStatus[]> = {
  proposed: ["assigned", "abandoned"],
  assigned: ["finished", "abandoned"],
  finished: [],
  abandoned: [],
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
  it("returns the permitted next statuses for each state", () => {
    expect(allowedNextStatuses("proposed")).toEqual(["assigned", "abandoned"]);
    expect(allowedNextStatuses("assigned")).toEqual(["finished", "abandoned"]);
    expect(allowedNextStatuses("finished")).toEqual([]);
    expect(allowedNextStatuses("abandoned")).toEqual([]);
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
