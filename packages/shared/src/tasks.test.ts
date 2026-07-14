import { describe, expect, it } from "vitest";

import {
  allowedNextTaskStatuses,
  createTaskSchema,
  isTaskStatusTransitionAllowed,
  taskStatusRequiresReport,
  taskStatusSchema,
  taskStatusTransitions,
  updateTaskSchema,
} from "./tasks.js";
import type { TaskStatus } from "./tasks.js";

describe("task status enum", () => {
  it("accepts every documented status", () => {
    for (const status of ["proposed", "assigned", "finished", "abandoned"] as const) {
      expect(taskStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects an unknown status", () => {
    expect(() => taskStatusSchema.parse("archived")).toThrow();
  });
});

describe("task status transitions", () => {
  const statuses: readonly TaskStatus[] = ["proposed", "assigned", "finished", "abandoned"];

  // The board is a free kanban: any status may move to any *other* status.
  it("allows every move between two different statuses", () => {
    for (const from of statuses) {
      for (const to of statuses) {
        if (from === to) continue;
        expect(isTaskStatusTransitionAllowed(from, to)).toBe(true);
      }
    }
  });

  it("rejects a no-op (same status) for every status", () => {
    for (const status of statuses) {
      expect(isTaskStatusTransitionAllowed(status, status)).toBe(false);
    }
  });

  it("offers all other statuses as next, including out of a terminal state", () => {
    expect(allowedNextTaskStatuses("finished")).toEqual(["proposed", "assigned", "abandoned"]);
    expect(allowedNextTaskStatuses("abandoned")).toEqual(["proposed", "assigned", "finished"]);
  });

  it("returns a fresh mutable copy from allowedNext", () => {
    const next = allowedNextTaskStatuses("proposed");
    next.pop();
    expect(taskStatusTransitions.proposed).toEqual(["assigned", "finished", "abandoned"]);
  });
});

describe("taskStatusRequiresReport", () => {
  it("requires a report only when finishing", () => {
    expect(taskStatusRequiresReport("finished")).toBe(true);
    expect(taskStatusRequiresReport("proposed")).toBe(false);
    expect(taskStatusRequiresReport("assigned")).toBe(false);
    expect(taskStatusRequiresReport("abandoned")).toBe(false);
  });
});

describe("createTaskSchema", () => {
  it("defaults the description and allows an optional deck + assignee", () => {
    const parsed = createTaskSchema.parse({ title: "Test Fai matchup" });
    expect(parsed).toEqual({ title: "Test Fai matchup", description: "" });

    const linked = createTaskSchema.parse({
      title: "Try new tech",
      deckId: "deck_1",
      assigneeId: "user_1",
    });
    expect(linked.deckId).toBe("deck_1");
    expect(linked.assigneeId).toBe("user_1");
  });

  it("rejects an empty title", () => {
    expect(createTaskSchema.safeParse({ title: "  " }).success).toBe(false);
  });
});

describe("updateTaskSchema", () => {
  it("requires at least one field and rejects unknown keys", () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
    expect(updateTaskSchema.safeParse({ teamId: "team_1" }).success).toBe(false);
  });

  it("allows clearing the deck link and assignee with null", () => {
    const parsed = updateTaskSchema.parse({ deckId: null, assigneeId: null });
    expect(parsed.deckId).toBeNull();
    expect(parsed.assigneeId).toBeNull();
  });
});
