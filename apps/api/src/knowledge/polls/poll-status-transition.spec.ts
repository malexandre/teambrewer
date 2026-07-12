import type { PollStatus } from "@teambrewer/shared";
import { describe, expect, it } from "vitest";

import { assertPollStatusTransition } from "./poll-status-transition.js";

/**
 * The poll lifecycle (docs/features/team-knowledge.md): an open poll may be closed and a
 * closed poll reopened. Every other move — including a no-op — is rejected here (the
 * service additionally forbids reopening a poll past its `closesAt`).
 */
const ALL_STATUSES: PollStatus[] = ["open", "closed"];

const ALLOWED: Record<PollStatus, PollStatus[]> = {
  open: ["closed"],
  closed: ["open"],
};

describe("assertPollStatusTransition", () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const isAllowed = ALLOWED[from].includes(to);
      it(`${isAllowed ? "allows" : "rejects"} ${from} -> ${to}`, () => {
        if (isAllowed) {
          expect(() => assertPollStatusTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertPollStatusTransition(from, to)).toThrow();
        }
      });
    }
  }

  it("rejects a no-op transition for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(() => assertPollStatusTransition(status, status)).toThrow();
    }
  });
});
