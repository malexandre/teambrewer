import type { EventStatus } from "@teambrewer/shared";
import { describe, expect, it } from "vitest";

import { allowedNextStatuses, assertEventStatusTransition } from "./event-status-transition.js";

/**
 * The event lifecycle (docs/features/events-and-gauntlets.md): the forward path
 * `upcoming → active → completed → archived`, plus a cancellation shortcut to
 * `archived` from `upcoming`/`active`. `archived` is terminal. Every other move —
 * including a no-op — is rejected. This table is the single source of truth for
 * the tests below.
 */
const ALL_STATUSES: EventStatus[] = ["upcoming", "active", "completed", "archived"];

const ALLOWED: Record<EventStatus, EventStatus[]> = {
  upcoming: ["active", "archived"],
  active: ["completed", "archived"],
  completed: ["archived"],
  archived: [],
};

describe("assertEventStatusTransition", () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const isAllowed = ALLOWED[from].includes(to);
      it(`${isAllowed ? "allows" : "rejects"} ${from} -> ${to}`, () => {
        if (isAllowed) {
          expect(() => assertEventStatusTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertEventStatusTransition(from, to)).toThrow();
        }
      });
    }
  }

  it("rejects a no-op transition (from === to) for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(() => assertEventStatusTransition(status, status)).toThrow();
    }
  });

  it("does not allow reviving an archived event", () => {
    expect(() => assertEventStatusTransition("archived", "upcoming")).toThrow();
    expect(() => assertEventStatusTransition("archived", "active")).toThrow();
  });
});

describe("allowedNextStatuses", () => {
  it("returns the permitted next statuses for each state", () => {
    expect(allowedNextStatuses("upcoming")).toEqual(["active", "archived"]);
    expect(allowedNextStatuses("active")).toEqual(["completed", "archived"]);
    expect(allowedNextStatuses("completed")).toEqual(["archived"]);
    expect(allowedNextStatuses("archived")).toEqual([]);
  });
});
