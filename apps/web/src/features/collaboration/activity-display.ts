import type { ActivityVerb } from "@teambrewer/shared";

/** Human-readable phrasing for each activity verb (the actor precedes it). */
export const ACTIVITY_VERB_LABELS: Record<ActivityVerb, string> = {
  deck_created: "created a deck",
  deck_updated: "updated a deck",
  deck_status_changed: "changed a deck's status",
  game_log_created: "logged a game",
  game_log_updated: "updated a game log",
  matchup_game_plan_created: "wrote a game-plan",
  matchup_game_plan_updated: "updated a game-plan",
  meta_created: "created a meta",
  meta_updated: "updated a meta",
  task_created: "created a task",
  task_updated: "updated a task",
  task_status_changed: "changed a task's status",
  commented: "commented",
};
