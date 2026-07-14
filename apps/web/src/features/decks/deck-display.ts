import type { DeckStatus, DeckVisibility } from "@teambrewer/shared";

import type { BadgeTone } from "@/components/ui/badge";

/** Human labels for the deck lifecycle states (single place so UI reads consistently). */
export const DECK_STATUS_LABELS: Record<DeckStatus, string> = {
  exploratory: "Exploratory",
  testing: "Testing",
  tournament_ready: "Tournament ready",
  retired: "Retired",
};

/** Badge tone per deck lifecycle state: exploratory reads as neutral, testing as
 *  in-progress (warning), tournament-ready as success, retired as a quiet neutral. */
export const DECK_STATUS_TONE: Record<DeckStatus, BadgeTone> = {
  exploratory: "info",
  testing: "warning",
  tournament_ready: "success",
  retired: "neutral",
};

/** Human labels for deck visibility. */
export const DECK_VISIBILITY_LABELS: Record<DeckVisibility, string> = {
  team: "Team",
  private: "Private",
};

/** Visibility is informational, not a status — team is neutral, private nudged with info. */
export const DECK_VISIBILITY_TONE: Record<DeckVisibility, BadgeTone> = {
  team: "neutral",
  private: "info",
};

/** Native-select styling shared by the deck pickers/controls (matches AdminPage). */
export const SELECT_CLASS = "h-9 rounded-md border border-input bg-background px-2 text-sm";
