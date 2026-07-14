-- Metas (R-7, iteration 2): a meta now belongs to a specific format. Add the column
-- NULLABLE first, backfill each existing meta to its team's game's default format
-- (constructed-first, then lowest sort_order), then enforce NOT NULL + the FK. The
-- app is pre-release/local-first, so rewriting existing rows this way is acceptable.

-- AlterTable: add the column nullable so existing rows can be backfilled.
ALTER TABLE "meta" ADD COLUMN "format_id" TEXT;

-- Backfill: point each meta at its team's game's default format.
UPDATE "meta"
SET "format_id" = (
  SELECT "f"."id"
  FROM "format" "f"
  JOIN "team" "t" ON "t"."game_id" = "f"."game_id"
  WHERE "t"."id" = "meta"."team_id"
  ORDER BY "f"."is_constructed" DESC, "f"."sort_order" ASC
  LIMIT 1
);

-- Enforce NOT NULL now that every row is backfilled.
ALTER TABLE "meta" ALTER COLUMN "format_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "meta_team_id_format_id_idx" ON "meta"("team_id", "format_id");

-- AddForeignKey
ALTER TABLE "meta" ADD CONSTRAINT "meta_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "format"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
