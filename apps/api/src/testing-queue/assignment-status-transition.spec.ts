import type { TestAssignmentStatus } from "@teambrewer/shared";
import { describe, expect, it } from "vitest";

import {
  allowedNextStatuses,
  assertAssignmentStatusTransition,
} from "./assignment-status-transition.js";

/**
 * The test-assignment lifecycle (docs/features/testing-queue.md): the forward path
 * `open → in_progress → done`, plus a `cancelled` terminal reachable from `open` or
 * `in_progress`. `done` and `cancelled` are terminal. Every other move — including a
 * no-op — is rejected. This table is the single source of truth for the tests below.
 */
const ALL_STATUSES: TestAssignmentStatus[] = ["open", "in_progress", "done", "cancelled"];

const ALLOWED: Record<TestAssignmentStatus, TestAssignmentStatus[]> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

describe("assertAssignmentStatusTransition", () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const isAllowed = ALLOWED[from].includes(to);
      it(`${isAllowed ? "allows" : "rejects"} ${from} -> ${to}`, () => {
        if (isAllowed) {
          expect(() => assertAssignmentStatusTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertAssignmentStatusTransition(from, to)).toThrow();
        }
      });
    }
  }

  it("rejects a no-op transition (from === to) for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(() => assertAssignmentStatusTransition(status, status)).toThrow();
    }
  });
});

describe("allowedNextStatuses", () => {
  it("returns the permitted next statuses for each state", () => {
    expect(allowedNextStatuses("open")).toEqual(["in_progress", "cancelled"]);
    expect(allowedNextStatuses("in_progress")).toEqual(["done", "cancelled"]);
    expect(allowedNextStatuses("done")).toEqual([]);
    expect(allowedNextStatuses("cancelled")).toEqual([]);
  });
});
