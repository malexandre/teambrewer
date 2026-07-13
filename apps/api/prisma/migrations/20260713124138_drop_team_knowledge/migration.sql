/*
  Warnings:

  - You are about to drop the `decision` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `poll` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `poll_vote` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `primer` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "decision" DROP CONSTRAINT "decision_author_id_fkey";

-- DropForeignKey
ALTER TABLE "decision" DROP CONSTRAINT "decision_team_id_fkey";

-- DropForeignKey
ALTER TABLE "poll" DROP CONSTRAINT "poll_author_id_fkey";

-- DropForeignKey
ALTER TABLE "poll" DROP CONSTRAINT "poll_team_id_fkey";

-- DropForeignKey
ALTER TABLE "poll_vote" DROP CONSTRAINT "poll_vote_poll_id_fkey";

-- DropForeignKey
ALTER TABLE "poll_vote" DROP CONSTRAINT "poll_vote_user_id_fkey";

-- DropForeignKey
ALTER TABLE "primer" DROP CONSTRAINT "primer_author_id_fkey";

-- DropForeignKey
ALTER TABLE "primer" DROP CONSTRAINT "primer_related_deck_id_fkey";

-- DropForeignKey
ALTER TABLE "primer" DROP CONSTRAINT "primer_team_id_fkey";

-- DropTable
DROP TABLE "decision";

-- DropTable
DROP TABLE "poll";

-- DropTable
DROP TABLE "poll_vote";

-- DropTable
DROP TABLE "primer";

-- DropEnum
DROP TYPE "PollStatus";

-- DropEnum
DROP TYPE "PrimerKind";

-- DropEnum
DROP TYPE "PrimerVisibility";
