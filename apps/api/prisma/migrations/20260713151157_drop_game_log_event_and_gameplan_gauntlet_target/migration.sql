/*
  Warnings:

  - You are about to drop the column `event_id` on the `game_log` table. All the data in the column will be lost.
  - You are about to drop the column `opponent_gauntlet_entry_id` on the `matchup_game_plan` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "game_log" DROP CONSTRAINT "game_log_event_id_fkey";

-- DropForeignKey
ALTER TABLE "matchup_game_plan" DROP CONSTRAINT "matchup_game_plan_opponent_gauntlet_entry_id_fkey";

-- DropIndex
DROP INDEX "game_log_team_id_event_id_idx";

-- AlterTable
ALTER TABLE "game_log" DROP COLUMN "event_id";

-- AlterTable
ALTER TABLE "matchup_game_plan" DROP COLUMN "opponent_gauntlet_entry_id";
