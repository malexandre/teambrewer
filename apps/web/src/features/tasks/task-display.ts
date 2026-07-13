import type { TaskStatus } from "@teambrewer/shared";

/** Human labels for the task lifecycle (single place, consistent UI). */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  proposed: "Proposed",
  assigned: "Assigned",
  finished: "Finished",
  abandoned: "Abandoned",
};

/** The board columns, in lifecycle order. */
export const TASK_STATUS_ORDER: TaskStatus[] = ["proposed", "assigned", "finished", "abandoned"];

/** Native-select styling shared by the task controls (matches the deck controls). */
export const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-2 text-sm";
