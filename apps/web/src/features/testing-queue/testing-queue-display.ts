import type { CardTestSuggestionStatus, TestAssignmentStatus } from "@teambrewer/shared";

/** Human labels for the card-test-suggestion lifecycle (single place, consistent UI). */
export const SUGGESTION_STATUS_LABELS: Record<CardTestSuggestionStatus, string> = {
  proposed: "Proposed",
  testing: "Testing",
  adopted: "Adopted",
  rejected: "Rejected",
};

/** The board columns, in lifecycle order. */
export const SUGGESTION_STATUS_ORDER: CardTestSuggestionStatus[] = [
  "proposed",
  "testing",
  "adopted",
  "rejected",
];

/** Human labels for the test-assignment lifecycle. */
export const ASSIGNMENT_STATUS_LABELS: Record<TestAssignmentStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

/** Native-select styling shared by the testing-queue controls (matches the deck controls). */
export const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-2 text-sm";

/** A short "+X / −Y" or "+X" phrasing for a suggestion's card swap. */
export function cardSwapSummary(cardInName: string, cardOutName: string | null): string {
  return cardOutName ? `+${cardInName} / −${cardOutName}` : `+${cardInName}`;
}
