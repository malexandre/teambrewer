import type { ActivityVerb } from "@teambrewer/shared";

/** Human-readable phrasing for each activity verb (the actor precedes it). */
export const ACTIVITY_VERB_LABELS: Record<ActivityVerb, string> = {
  deck_created: "created a deck",
  deck_updated: "updated a deck",
  deck_status_changed: "changed a deck's status",
  commented: "commented",
};
