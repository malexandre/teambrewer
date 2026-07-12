-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('upcoming', 'active', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "EventImportance" AS ENUM ('local', 'regional', 'national', 'major');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('going', 'maybe', 'not_going');

-- CreateTable
CREATE TABLE "event" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "importance" "EventImportance" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "EventStatus" NOT NULL DEFAULT 'upcoming',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gauntlet_entry" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "reference_deck_id" TEXT,
    "hero_id" TEXT,
    "archetype_label" TEXT,
    "expected_meta_share" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gauntlet_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_team_id_idx" ON "event"("team_id");

-- CreateIndex
CREATE INDEX "event_team_id_status_idx" ON "event"("team_id", "status");

-- CreateIndex
CREATE INDEX "event_team_id_format_id_idx" ON "event"("team_id", "format_id");

-- CreateIndex
CREATE INDEX "event_team_id_importance_idx" ON "event"("team_id", "importance");

-- CreateIndex
CREATE INDEX "gauntlet_entry_event_id_idx" ON "gauntlet_entry"("event_id");

-- CreateIndex
CREATE INDEX "gauntlet_entry_team_id_idx" ON "gauntlet_entry"("team_id");

-- CreateIndex
CREATE INDEX "attendance_event_id_idx" ON "attendance"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_event_id_user_id_key" ON "attendance"("event_id", "user_id");

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "format"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gauntlet_entry" ADD CONSTRAINT "gauntlet_entry_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gauntlet_entry" ADD CONSTRAINT "gauntlet_entry_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gauntlet_entry" ADD CONSTRAINT "gauntlet_entry_reference_deck_id_fkey" FOREIGN KEY ("reference_deck_id") REFERENCES "deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gauntlet_entry" ADD CONSTRAINT "gauntlet_entry_hero_id_fkey" FOREIGN KEY ("hero_id") REFERENCES "hero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
