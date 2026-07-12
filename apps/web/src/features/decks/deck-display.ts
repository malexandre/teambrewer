import type { DeckStatus, DeckVisibility } from "@teambrewer/shared";

/** Human labels for the deck lifecycle states (single place so UI reads consistently). */
export const DECK_STATUS_LABELS: Record<DeckStatus, string> = {
  exploratory: "Exploratory",
  testing: "Testing",
  tournament_ready: "Tournament ready",
  retired: "Retired",
};

/** Human labels for deck visibility. */
export const DECK_VISIBILITY_LABELS: Record<DeckVisibility, string> = {
  team: "Team",
  private: "Private",
};

/** Native-select styling shared by the deck pickers/controls (matches AdminPage). */
export const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-2 text-sm";
