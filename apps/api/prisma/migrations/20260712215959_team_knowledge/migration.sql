-- CreateEnum
CREATE TYPE "PrimerKind" AS ENUM ('deck_primer', 'matchup', 'format_notes', 'other');

-- CreateEnum
CREATE TYPE "PrimerVisibility" AS ENUM ('team', 'private');

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('open', 'closed');

-- CreateTable
CREATE TABLE "primer" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "PrimerKind" NOT NULL,
    "related_deck_id" TEXT,
    "body" TEXT NOT NULL,
    "visibility" "PrimerVisibility" NOT NULL DEFAULT 'team',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "primer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "related_subject_type" TEXT,
    "related_subject_id" TEXT,
    "related_subject_snapshot_label" TEXT,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "status" "PollStatus" NOT NULL DEFAULT 'open',
    "closes_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_vote" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "primer_team_id_idx" ON "primer"("team_id");

-- CreateIndex
CREATE INDEX "primer_team_id_kind_idx" ON "primer"("team_id", "kind");

-- CreateIndex
CREATE INDEX "primer_team_id_related_deck_id_idx" ON "primer"("team_id", "related_deck_id");

-- CreateIndex
CREATE INDEX "decision_team_id_idx" ON "decision"("team_id");

-- CreateIndex
CREATE INDEX "decision_team_id_decided_at_idx" ON "decision"("team_id", "decided_at");

-- CreateIndex
CREATE INDEX "poll_team_id_idx" ON "poll"("team_id");

-- CreateIndex
CREATE INDEX "poll_team_id_status_idx" ON "poll"("team_id", "status");

-- CreateIndex
CREATE INDEX "poll_vote_poll_id_idx" ON "poll_vote"("poll_id");

-- CreateIndex
CREATE UNIQUE INDEX "poll_vote_poll_id_user_id_key" ON "poll_vote"("poll_id", "user_id");

-- AddForeignKey
ALTER TABLE "primer" ADD CONSTRAINT "primer_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "primer" ADD CONSTRAINT "primer_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "primer" ADD CONSTRAINT "primer_related_deck_id_fkey" FOREIGN KEY ("related_deck_id") REFERENCES "deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll" ADD CONSTRAINT "poll_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll" ADD CONSTRAINT "poll_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
