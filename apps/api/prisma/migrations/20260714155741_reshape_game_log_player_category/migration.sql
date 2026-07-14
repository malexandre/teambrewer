/*
  Warnings:

  - You are about to drop the column `external_opponent_name` on the `game_log` table. All the data in the column will be lost.
  - You are about to drop the column `opponent_pilot_user_id` on the `game_log` table. All the data in the column will be lost.
  - You are about to drop the column `pilot_user_id` on the `game_log` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "PlayerCategory" AS ENUM ('teammate', 'circuit_player', 'other');

-- DropForeignKey
ALTER TABLE "game_log" DROP CONSTRAINT "game_log_opponent_pilot_user_id_fkey";

-- DropForeignKey
ALTER TABLE "game_log" DROP CONSTRAINT "game_log_pilot_user_id_fkey";

-- DropIndex
DROP INDEX "game_log_team_id_opponent_pilot_user_id_idx";

-- DropIndex
DROP INDEX "game_log_team_id_pilot_user_id_idx";

-- AlterTable
ALTER TABLE "game_log" DROP COLUMN "external_opponent_name",
DROP COLUMN "opponent_pilot_user_id",
DROP COLUMN "pilot_user_id",
ADD COLUMN     "opponent_player_category" "PlayerCategory" NOT NULL DEFAULT 'other',
ADD COLUMN     "self_player_category" "PlayerCategory" NOT NULL DEFAULT 'teammate';
