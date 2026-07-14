-- Game logs (R-1 part C): model BOTH sides as matchup subjects. Side A (self) and
-- side B (opponent) each become exactly one of a team deck, a meta deck entry, or a
-- (hero + label); pilots become optional. The old bare opponent columns are RENAMED
-- (not dropped) so existing rows keep their opponent hero / archetype label.

-- DropForeignKey
ALTER TABLE "game_log" DROP CONSTRAINT "game_log_deck_id_fkey";

-- DropForeignKey
ALTER TABLE "game_log" DROP CONSTRAINT "game_log_hero_id_fkey";

-- DropForeignKey
ALTER TABLE "game_log" DROP CONSTRAINT "game_log_pilot_user_id_fkey";

-- DropIndex
DROP INDEX "game_log_team_id_hero_id_idx";

-- AlterTable: rename the opponent columns (preserving data), add the self-side and
-- meta-entry subject columns, and relax the pilot/deck columns to nullable.
ALTER TABLE "game_log" RENAME COLUMN "hero_id" TO "opponent_hero_id";
ALTER TABLE "game_log" RENAME COLUMN "archetype_label" TO "opponent_archetype_label";
ALTER TABLE "game_log"
  ADD COLUMN "opponent_meta_deck_entry_id" TEXT,
  ADD COLUMN "self_archetype_label" TEXT,
  ADD COLUMN "self_hero_id" TEXT,
  ADD COLUMN "self_meta_deck_entry_id" TEXT,
  ALTER COLUMN "pilot_user_id" DROP NOT NULL,
  ALTER COLUMN "deck_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "game_log_team_id_opponent_hero_id_idx" ON "game_log"("team_id", "opponent_hero_id");

-- CreateIndex
CREATE INDEX "game_log_team_id_opponent_meta_deck_entry_id_idx" ON "game_log"("team_id", "opponent_meta_deck_entry_id");

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_pilot_user_id_fkey" FOREIGN KEY ("pilot_user_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_self_meta_deck_entry_id_fkey" FOREIGN KEY ("self_meta_deck_entry_id") REFERENCES "meta_deck_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_self_hero_id_fkey" FOREIGN KEY ("self_hero_id") REFERENCES "hero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_opponent_meta_deck_entry_id_fkey" FOREIGN KEY ("opponent_meta_deck_entry_id") REFERENCES "meta_deck_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_opponent_hero_id_fkey" FOREIGN KEY ("opponent_hero_id") REFERENCES "hero"("id") ON DELETE SET NULL ON UPDATE CASCADE;
