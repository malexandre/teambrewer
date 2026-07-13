-- CreateEnum
CREATE TYPE "MetaTier" AS ENUM ('meta_defining', 'contender', 'counter_meta', 'fringe');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('proposed', 'assigned', 'finished', 'abandoned');

-- AlterTable
ALTER TABLE "game_log" ADD COLUMN     "meta_id" TEXT;

-- CreateTable
CREATE TABLE "meta" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_deck_entry" (
    "id" TEXT NOT NULL,
    "meta_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "tier" "MetaTier" NOT NULL,
    "reference_deck_id" TEXT,
    "hero_id" TEXT,
    "archetype_label" TEXT,
    "opponent_snapshot_label" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_deck_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deck_meta" (
    "id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "meta_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deck_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "deck_id" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'proposed',
    "assignee_id" TEXT,
    "report" TEXT NOT NULL DEFAULT '',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_vote" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meta_team_id_idx" ON "meta"("team_id");

-- CreateIndex
CREATE INDEX "meta_team_id_start_date_idx" ON "meta"("team_id", "start_date");

-- CreateIndex
CREATE INDEX "meta_deck_entry_team_id_idx" ON "meta_deck_entry"("team_id");

-- CreateIndex
CREATE INDEX "meta_deck_entry_meta_id_idx" ON "meta_deck_entry"("meta_id");

-- CreateIndex
CREATE INDEX "deck_meta_meta_id_idx" ON "deck_meta"("meta_id");

-- CreateIndex
CREATE UNIQUE INDEX "deck_meta_deck_id_meta_id_key" ON "deck_meta"("deck_id", "meta_id");

-- CreateIndex
CREATE INDEX "task_team_id_idx" ON "task"("team_id");

-- CreateIndex
CREATE INDEX "task_team_id_status_idx" ON "task"("team_id", "status");

-- CreateIndex
CREATE INDEX "task_team_id_deck_id_idx" ON "task"("team_id", "deck_id");

-- CreateIndex
CREATE INDEX "task_team_id_assignee_id_idx" ON "task"("team_id", "assignee_id");

-- CreateIndex
CREATE INDEX "task_vote_task_id_idx" ON "task_vote"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_vote_task_id_user_id_key" ON "task_vote"("task_id", "user_id");

-- CreateIndex
CREATE INDEX "game_log_team_id_meta_id_idx" ON "game_log"("team_id", "meta_id");

-- AddForeignKey
ALTER TABLE "game_log" ADD CONSTRAINT "game_log_meta_id_fkey" FOREIGN KEY ("meta_id") REFERENCES "meta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta" ADD CONSTRAINT "meta_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_deck_entry" ADD CONSTRAINT "meta_deck_entry_meta_id_fkey" FOREIGN KEY ("meta_id") REFERENCES "meta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_deck_entry" ADD CONSTRAINT "meta_deck_entry_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_deck_entry" ADD CONSTRAINT "meta_deck_entry_reference_deck_id_fkey" FOREIGN KEY ("reference_deck_id") REFERENCES "deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_deck_entry" ADD CONSTRAINT "meta_deck_entry_hero_id_fkey" FOREIGN KEY ("hero_id") REFERENCES "hero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_meta" ADD CONSTRAINT "deck_meta_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_meta" ADD CONSTRAINT "deck_meta_meta_id_fkey" FOREIGN KEY ("meta_id") REFERENCES "meta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_vote" ADD CONSTRAINT "task_vote_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_vote" ADD CONSTRAINT "task_vote_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
