-- CreateEnum
CREATE TYPE "GameSide" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "WinType" AS ENUM ('life_to_zero', 'on_time', 'opponent_concede', 'deck_out');

-- CreateEnum
CREATE TYPE "LossReason" AS ENUM ('outplayed', 'misplay', 'on_time', 'mismatch', 'variance', 'deck_out');

-- CreateEnum
CREATE TYPE "SkillParity" AS ENUM ('evenly_matched', 'minor_gap', 'major_gap');

-- CreateEnum
CREATE TYPE "Seriousness" AS ENUM ('tournament_serious', 'focused_practice', 'casual');

-- CreateEnum
CREATE TYPE "DeckMaturity" AS ENUM ('both_tuned', 'partially_tuned', 'experimental');

-- CreateEnum
CREATE TYPE "PilotFamiliarity" AS ENUM ('knows_well', 'learning', 'first_time');

-- CreateTable
CREATE TABLE "game_log" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "logged_by_id" TEXT NOT NULL,
    "format_id" TEXT NOT NULL,
    "event_id" TEXT,
    "played_at" TIMESTAMP(3) NOT NULL,
    "pilot_user_id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "opponent_pilot_user_id" TEXT,
    "external_opponent_name" TEXT,
    "opponent_deck_id" TEXT,
    "hero_id" TEXT,
    "archetype_label" TEXT,
    "first_player_side" "GameSide" NOT NULL,
    "best_of" INTEGER NOT NULL,
    "games_won_a" INTEGER NOT NULL,
    "games_won_b" INTEGER NOT NULL,
    "win_type" "WinType",
    "loss_reason" "LossReason",
    "learnings" TEXT NOT NULL DEFAULT '',
    "skill_parity" "SkillParity" NOT NULL,
    "seriousness" "Seriousness" NOT NULL,
    "deck_maturity" "DeckMaturity" NOT NULL,
    "pilot_familiarity" "PilotFamiliarity" NOT NULL,
    "confidence_weight" DOUBLE PRECISION NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_log_team_id_idx" ON "game_log"("team_id");

-- CreateIndex
CREATE INDEX "game_log_team_id_format_id_idx" ON "game_log"("team_id", "format_id");

-- CreateIndex
CREATE INDEX "game_log_team_id_event_id_idx" ON "game_log"("team_id", "event_id");

-- CreateIndex
CREATE INDEX "game_log_team_id_deck_id_idx" ON "game_log"("team_id", "deck_id");

-- CreateIndex
CREATE INDEX "game_log_team_id_hero_id_idx" ON "game_log"("team_id", "hero_id");

-- CreateIndex
CREATE INDEX "game_log_team_id_pilot_user_id_idx" ON "game_log"("team_id", "pilot_user_id");

-- CreateIndex
CREATE INDEX "game_log_team_id_opponent_deck_id_idx" ON "game_log"("team_id", "opponent_deck_id");

-- CreateIndex
CREATE INDEX "game_log_team_id_opponent_pilot_user_id_idx" ON "game_log"("team_id", "opponent_pilot_user_id");

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_logged_by_id_fkey" FOREIGN KEY ("logged_by_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "format"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_pilot_user_id_fkey" FOREIGN KEY ("pilot_user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_opponent_pilot_user_id_fkey" FOREIGN KEY ("opponent_pilot_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_opponent_deck_id_fkey" FOREIGN KEY ("opponent_deck_id") REFERENCES "deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_hero_id_fkey" FOREIGN KEY ("hero_id") REFERENCES "hero"("id") ON DELETE SET NULL ON UPDATE CASCADE;
