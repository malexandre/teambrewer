-- Matchup-subject foundation (R-1): drop the reference-deck concept, reshape meta
-- deck entries around a required free-text label + optional hero, mirror the same
-- shape on game-plans, and add an explicit game-plan ↔ meta-deck-entry join.
--
-- Pre-release, local-first: this migration BACKFILLS the new NOT-NULL columns from
-- existing data so a dev database that already holds rows migrates cleanly instead
-- of failing on the added-required-column / set-not-null steps.

-- DropForeignKey
ALTER TABLE "meta_deck_entry" DROP CONSTRAINT "meta_deck_entry_reference_deck_id_fkey";

-- AlterTable: the reference-deck flag is gone app-wide.
ALTER TABLE "deck" DROP COLUMN "is_reference";

-- AlterTable: meta deck entry becomes a (label + optional hero) matchup subject.
-- Add `label` nullable, backfill from the durable snapshot label, then enforce
-- NOT NULL; finally drop the retired target columns.
ALTER TABLE "meta_deck_entry" ADD COLUMN "label" TEXT;
UPDATE "meta_deck_entry" SET "label" = "opponent_snapshot_label";
ALTER TABLE "meta_deck_entry" ALTER COLUMN "label" SET NOT NULL;
ALTER TABLE "meta_deck_entry" DROP COLUMN "archetype_label",
DROP COLUMN "reference_deck_id";

-- AlterTable: the game-plan opponent label becomes required (mirroring meta
-- entries). Backfill any hero-only plans (label was NULL) from the snapshot label,
-- then recompute opponent_ref to the label-aware scheme so hero-qualified subjects
-- (and repeated heroes under different labels) stay distinct.
UPDATE "matchup_game_plan"
SET "opponent_archetype_label" = "opponent_snapshot_label"
WHERE "opponent_archetype_label" IS NULL;
UPDATE "matchup_game_plan"
SET "opponent_ref" = CASE
  WHEN "opponent_hero_id" IS NOT NULL
    THEN 'hero:' || "opponent_hero_id" || '|label:' || lower(trim("opponent_archetype_label"))
  ELSE 'label:' || lower(trim("opponent_archetype_label"))
END;
ALTER TABLE "matchup_game_plan" ALTER COLUMN "opponent_archetype_label" SET NOT NULL;

-- CreateTable
CREATE TABLE "game_plan_meta_deck_entry" (
    "id" TEXT NOT NULL,
    "game_plan_id" TEXT NOT NULL,
    "meta_deck_entry_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_plan_meta_deck_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_plan_meta_deck_entry_meta_deck_entry_id_idx" ON "game_plan_meta_deck_entry"("meta_deck_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_plan_meta_deck_entry_game_plan_id_meta_deck_entry_id_key" ON "game_plan_meta_deck_entry"("game_plan_id", "meta_deck_entry_id");

-- AddForeignKey
ALTER TABLE "game_plan_meta_deck_entry" ADD CONSTRAINT "game_plan_meta_deck_entry_game_plan_id_fkey" FOREIGN KEY ("game_plan_id") REFERENCES "matchup_game_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_plan_meta_deck_entry" ADD CONSTRAINT "game_plan_meta_deck_entry_meta_deck_entry_id_fkey" FOREIGN KEY ("meta_deck_entry_id") REFERENCES "meta_deck_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
