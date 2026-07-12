-- CreateEnum
CREATE TYPE "CardTestSuggestionStatus" AS ENUM ('proposed', 'testing', 'adopted', 'rejected');

-- CreateEnum
CREATE TYPE "TestAssignmentStatus" AS ENUM ('open', 'in_progress', 'done', 'cancelled');

-- CreateTable
CREATE TABLE "card_test_suggestion" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "card_in_id" TEXT NOT NULL,
    "card_out_id" TEXT,
    "reasoning" TEXT NOT NULL,
    "status" "CardTestSuggestionStatus" NOT NULL DEFAULT 'proposed',
    "resolution_note" TEXT NOT NULL DEFAULT '',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_test_suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestion_vote" (
    "id" TEXT NOT NULL,
    "suggestion_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suggestion_vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_assignment" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "event_id" TEXT,
    "assignee_id" TEXT NOT NULL,
    "assigned_by_id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "opponent_gauntlet_entry_id" TEXT,
    "opponent_hero_id" TEXT,
    "opponent_archetype_label" TEXT,
    "opponent_snapshot_label" TEXT NOT NULL,
    "target_games" INTEGER,
    "status" "TestAssignmentStatus" NOT NULL DEFAULT 'open',
    "notes" TEXT NOT NULL DEFAULT '',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_test_suggestion_team_id_idx" ON "card_test_suggestion"("team_id");

-- CreateIndex
CREATE INDEX "card_test_suggestion_team_id_deck_id_idx" ON "card_test_suggestion"("team_id", "deck_id");

-- CreateIndex
CREATE INDEX "card_test_suggestion_team_id_status_idx" ON "card_test_suggestion"("team_id", "status");

-- CreateIndex
CREATE INDEX "suggestion_vote_suggestion_id_idx" ON "suggestion_vote"("suggestion_id");

-- CreateIndex
CREATE UNIQUE INDEX "suggestion_vote_suggestion_id_user_id_key" ON "suggestion_vote"("suggestion_id", "user_id");

-- CreateIndex
CREATE INDEX "test_assignment_team_id_idx" ON "test_assignment"("team_id");

-- CreateIndex
CREATE INDEX "test_assignment_team_id_status_idx" ON "test_assignment"("team_id", "status");

-- CreateIndex
CREATE INDEX "test_assignment_team_id_assignee_id_idx" ON "test_assignment"("team_id", "assignee_id");

-- CreateIndex
CREATE INDEX "test_assignment_team_id_deck_id_idx" ON "test_assignment"("team_id", "deck_id");

-- CreateIndex
CREATE INDEX "test_assignment_team_id_event_id_idx" ON "test_assignment"("team_id", "event_id");

-- AddForeignKey
ALTER TABLE "card_test_suggestion" ADD CONSTRAINT "card_test_suggestion_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_test_suggestion" ADD CONSTRAINT "card_test_suggestion_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_test_suggestion" ADD CONSTRAINT "card_test_suggestion_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_test_suggestion" ADD CONSTRAINT "card_test_suggestion_card_in_id_fkey" FOREIGN KEY ("card_in_id") REFERENCES "card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_test_suggestion" ADD CONSTRAINT "card_test_suggestion_card_out_id_fkey" FOREIGN KEY ("card_out_id") REFERENCES "card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion_vote" ADD CONSTRAINT "suggestion_vote_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "card_test_suggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion_vote" ADD CONSTRAINT "suggestion_vote_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_assignment" ADD CONSTRAINT "test_assignment_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_assignment" ADD CONSTRAINT "test_assignment_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_assignment" ADD CONSTRAINT "test_assignment_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_assignment" ADD CONSTRAINT "test_assignment_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_assignment" ADD CONSTRAINT "test_assignment_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_assignment" ADD CONSTRAINT "test_assignment_opponent_gauntlet_entry_id_fkey" FOREIGN KEY ("opponent_gauntlet_entry_id") REFERENCES "gauntlet_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_assignment" ADD CONSTRAINT "test_assignment_opponent_hero_id_fkey" FOREIGN KEY ("opponent_hero_id") REFERENCES "hero"("id") ON DELETE SET NULL ON UPDATE CASCADE;
