/*
  Warnings:

  - You are about to drop the `matchup_game_plan_card` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "matchup_game_plan_card" DROP CONSTRAINT "matchup_game_plan_card_card_id_fkey";

-- DropForeignKey
ALTER TABLE "matchup_game_plan_card" DROP CONSTRAINT "matchup_game_plan_card_game_plan_id_fkey";

-- DropTable
DROP TABLE "matchup_game_plan_card";
