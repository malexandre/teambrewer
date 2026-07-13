-- AlterEnum
BEGIN;
CREATE TYPE "AttendanceStatus_new" AS ENUM ('going', 'interested');
ALTER TABLE "attendance" ALTER COLUMN "status" TYPE "AttendanceStatus_new" USING ("status"::text::"AttendanceStatus_new");
ALTER TYPE "AttendanceStatus" RENAME TO "AttendanceStatus_old";
ALTER TYPE "AttendanceStatus_new" RENAME TO "AttendanceStatus";
DROP TYPE "public"."AttendanceStatus_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "deck_selection" DROP CONSTRAINT "deck_selection_deck_id_fkey";

-- DropForeignKey
ALTER TABLE "deck_selection" DROP CONSTRAINT "deck_selection_event_id_fkey";

-- DropForeignKey
ALTER TABLE "deck_selection" DROP CONSTRAINT "deck_selection_user_id_fkey";

-- DropForeignKey
ALTER TABLE "event" DROP CONSTRAINT "event_format_id_fkey";

-- DropForeignKey
ALTER TABLE "gauntlet_entry" DROP CONSTRAINT "gauntlet_entry_event_id_fkey";

-- DropForeignKey
ALTER TABLE "gauntlet_entry" DROP CONSTRAINT "gauntlet_entry_hero_id_fkey";

-- DropForeignKey
ALTER TABLE "gauntlet_entry" DROP CONSTRAINT "gauntlet_entry_reference_deck_id_fkey";

-- DropForeignKey
ALTER TABLE "gauntlet_entry" DROP CONSTRAINT "gauntlet_entry_team_id_fkey";

-- DropForeignKey
ALTER TABLE "retrospective" DROP CONSTRAINT "retrospective_author_id_fkey";

-- DropForeignKey
ALTER TABLE "retrospective" DROP CONSTRAINT "retrospective_event_id_fkey";

-- DropForeignKey
ALTER TABLE "retrospective" DROP CONSTRAINT "retrospective_team_id_fkey";

-- DropIndex
DROP INDEX "event_team_id_format_id_idx";

-- DropIndex
DROP INDEX "event_team_id_importance_idx";

-- DropIndex
DROP INDEX "event_team_id_status_idx";

-- AlterTable
ALTER TABLE "event" DROP COLUMN "format_id",
DROP COLUMN "importance",
DROP COLUMN "status",
ADD COLUMN     "game_id" TEXT NOT NULL,
ADD COLUMN     "meta_id" TEXT;

-- DropTable
DROP TABLE "deck_selection";

-- DropTable
DROP TABLE "gauntlet_entry";

-- DropTable
DROP TABLE "retrospective";

-- DropEnum
DROP TYPE "EventImportance";

-- DropEnum
DROP TYPE "EventStatus";

-- CreateIndex
CREATE INDEX "event_team_id_meta_id_idx" ON "event"("team_id", "meta_id");

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_meta_id_fkey" FOREIGN KEY ("meta_id") REFERENCES "meta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
