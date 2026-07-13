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
  const legalTransitions: ReadonlyArray<[TaskStatus, TaskStatus]> = [
    ["proposed", "assigned"],
    ["proposed", "abandoned"],
    ["assigned", "finished"],
    ["assigned", "abandoned"],
  ];

  const illegalTransitions: ReadonlyArray<[TaskStatus, TaskStatus]> = [
    ["proposed", "finished"],
    ["assigned", "proposed"],
    ["finished", "assigned"],
    ["finished", "abandoned"],
    ["abandoned", "proposed"],
    ["proposed", "proposed"],
    ["assigned", "assigned"],
  ];

  it.each(legalTransitions)("allows %s → %s", (from, to) => {
    expect(isTaskStatusTransitionAllowed(from, to)).toBe(true);
  });

  it.each(illegalTransitions)("rejects %s → %s", (from, to) => {
    expect(isTaskStatusTransitionAllowed(from, to)).toBe(false);
  });

  it("treats finished and abandoned as terminal", () => {
    expect(allowedNextTaskStatuses("finished")).toEqual([]);
    expect(allowedNextTaskStatuses("abandoned")).toEqual([]);
  });

  it("returns a fresh mutable copy from allowedNext", () => {
    const next = allowedNextTaskStatuses("proposed");
    next.pop();
    expect(taskStatusTransitions.proposed).toEqual(["assigned", "abandoned"]);
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
