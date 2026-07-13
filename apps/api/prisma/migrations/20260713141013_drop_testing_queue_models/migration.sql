/*
  Warnings:

  - You are about to drop the `card_test_suggestion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `suggestion_vote` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `test_assignment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "card_test_suggestion" DROP CONSTRAINT "card_test_suggestion_author_id_fkey";

-- DropForeignKey
ALTER TABLE "card_test_suggestion" DROP CONSTRAINT "card_test_suggestion_card_in_id_fkey";

-- DropForeignKey
ALTER TABLE "card_test_suggestion" DROP CONSTRAINT "card_test_suggestion_card_out_id_fkey";

-- DropForeignKey
ALTER TABLE "card_test_suggestion" DROP CONSTRAINT "card_test_suggestion_deck_id_fkey";

-- DropForeignKey
ALTER TABLE "card_test_suggestion" DROP CONSTRAINT "card_test_suggestion_team_id_fkey";

-- DropForeignKey
ALTER TABLE "suggestion_vote" DROP CONSTRAINT "suggestion_vote_suggestion_id_fkey";

-- DropForeignKey
ALTER TABLE "suggestion_vote" DROP CONSTRAINT "suggestion_vote_user_id_fkey";

-- DropForeignKey
ALTER TABLE "test_assignment" DROP CONSTRAINT "test_assignment_assigned_by_id_fkey";

-- DropForeignKey
ALTER TABLE "test_assignment" DROP CONSTRAINT "test_assignment_assignee_id_fkey";

-- DropForeignKey
ALTER TABLE "test_assignment" DROP CONSTRAINT "test_assignment_deck_id_fkey";

-- DropForeignKey
ALTER TABLE "test_assignment" DROP CONSTRAINT "test_assignment_event_id_fkey";

-- DropForeignKey
ALTER TABLE "test_assignment" DROP CONSTRAINT "test_assignment_opponent_gauntlet_entry_id_fkey";

-- DropForeignKey
ALTER TABLE "test_assignment" DROP CONSTRAINT "test_assignment_opponent_hero_id_fkey";

-- DropForeignKey
ALTER TABLE "test_assignment" DROP CONSTRAINT "test_assignment_team_id_fkey";

-- DropTable
DROP TABLE "card_test_suggestion";

-- DropTable
DROP TABLE "suggestion_vote";

-- DropTable
DROP TABLE "test_assignment";

-- DropEnum
DROP TYPE "CardTestSuggestionStatus";

-- DropEnum
DROP TYPE "TestAssignmentStatus";
