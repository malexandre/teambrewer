-- Rework MatchupGamePlan: replace the opponent matchup subject (hero + archetype label
-- + derived opponent_ref / opponent_snapshot_label) with a single free-text `name`.
-- A plan is now just: a name, the meta decks it covers (GamePlanMetaDeckEntry), and a body.

-- 1. Add the name column nullable so existing rows can be backfilled first.
ALTER TABLE "matchup_game_plan" ADD COLUMN "name" TEXT;

-- 2. Backfill the name from the old server-derived snapshot label (preserves the title).
UPDATE "matchup_game_plan" SET "name" = "opponent_snapshot_label" WHERE "name" IS NULL;

-- 3. Enforce NOT NULL now that every row has a name.
ALTER TABLE "matchup_game_plan" ALTER COLUMN "name" SET NOT NULL;

-- 4. Drop the opponent matchup-subject: the uniqueness key, the hero FK, and the columns.
--    (Coverage is not backfilled: existing plans start with no covered meta decks.)
DROP INDEX "matchup_game_plan_team_id_our_deck_id_opponent_ref_format_i_key";
ALTER TABLE "matchup_game_plan" DROP CONSTRAINT "matchup_game_plan_opponent_hero_id_fkey";
ALTER TABLE "matchup_game_plan" DROP COLUMN "opponent_hero_id";
ALTER TABLE "matchup_game_plan" DROP COLUMN "opponent_archetype_label";
ALTER TABLE "matchup_game_plan" DROP COLUMN "opponent_ref";
ALTER TABLE "matchup_game_plan" DROP COLUMN "opponent_snapshot_label";
