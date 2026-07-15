-- Move GameLogCard.side from its own `ours`/`theirs` enum to the shared symmetric
-- `GameSide` (A/B) used by firstPlayerSide and the result, so a captured card is
-- attributed to a real matchup subject. Postgres can't remap enum values in place,
-- so add a new column, backfill (ours→A, theirs→B), then swap. GameSide already
-- exists, so no CREATE TYPE is needed.
ALTER TABLE "game_log_card" ADD COLUMN "side_new" "GameSide";

UPDATE "game_log_card"
SET "side_new" = CASE "side"
  WHEN 'ours' THEN 'A'::"GameSide"
  WHEN 'theirs' THEN 'B'::"GameSide"
END;

ALTER TABLE "game_log_card" ALTER COLUMN "side_new" SET NOT NULL;
ALTER TABLE "game_log_card" DROP COLUMN "side";
ALTER TABLE "game_log_card" RENAME COLUMN "side_new" TO "side";

DROP TYPE "GameLogCardSide";
