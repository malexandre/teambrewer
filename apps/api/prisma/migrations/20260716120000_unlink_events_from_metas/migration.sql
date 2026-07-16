-- Events become isolated: drop the optional Event -> Meta link (column, index, FK).
-- Reverses the additions from 20260713152000_strip_events_lightweight.
ALTER TABLE "event" DROP CONSTRAINT "event_meta_id_fkey";

DROP INDEX "event_team_id_meta_id_idx";

ALTER TABLE "event" DROP COLUMN "meta_id";
