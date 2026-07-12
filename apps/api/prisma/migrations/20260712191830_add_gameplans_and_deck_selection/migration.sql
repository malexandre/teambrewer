-- CreateTable
CREATE TABLE "matchup_game_plan" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "our_deck_id" TEXT NOT NULL,
    "format_id" TEXT NOT NULL,
    "opponent_gauntlet_entry_id" TEXT,
    "opponent_hero_id" TEXT,
    "opponent_archetype_label" TEXT,
    "opponent_ref" TEXT NOT NULL,
    "opponent_snapshot_label" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matchup_game_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matchup_game_plan_card" (
    "id" TEXT NOT NULL,
    "game_plan_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matchup_game_plan_card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deck_selection" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL DEFAULT '',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deck_selection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retrospective" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "results_summary" TEXT NOT NULL DEFAULT '',
    "learnings" TEXT NOT NULL DEFAULT '',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "retrospective_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matchup_game_plan_team_id_idx" ON "matchup_game_plan"("team_id");

-- CreateIndex
CREATE INDEX "matchup_game_plan_team_id_our_deck_id_idx" ON "matchup_game_plan"("team_id", "our_deck_id");

-- CreateIndex
CREATE UNIQUE INDEX "matchup_game_plan_team_id_our_deck_id_opponent_ref_format_i_key" ON "matchup_game_plan"("team_id", "our_deck_id", "opponent_ref", "format_id");

-- CreateIndex
CREATE INDEX "matchup_game_plan_card_game_plan_id_idx" ON "matchup_game_plan_card"("game_plan_id");

-- CreateIndex
CREATE INDEX "matchup_game_plan_card_card_id_idx" ON "matchup_game_plan_card"("card_id");

-- CreateIndex
CREATE UNIQUE INDEX "matchup_game_plan_card_game_plan_id_card_id_key" ON "matchup_game_plan_card"("game_plan_id", "card_id");

-- CreateIndex
CREATE INDEX "deck_selection_event_id_idx" ON "deck_selection"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "deck_selection_event_id_user_id_key" ON "deck_selection"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "retrospective_event_id_key" ON "retrospective"("event_id");

-- CreateIndex
CREATE INDEX "retrospective_team_id_idx" ON "retrospective"("team_id");

-- AddForeignKey
ALTER TABLE "matchup_game_plan" ADD CONSTRAINT "matchup_game_plan_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchup_game_plan" ADD CONSTRAINT "matchup_game_plan_our_deck_id_fkey" FOREIGN KEY ("our_deck_id") REFERENCES "deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchup_game_plan" ADD CONSTRAINT "matchup_game_plan_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "format"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchup_game_plan" ADD CONSTRAINT "matchup_game_plan_opponent_gauntlet_entry_id_fkey" FOREIGN KEY ("opponent_gauntlet_entry_id") REFERENCES "gauntlet_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchup_game_plan" ADD CONSTRAINT "matchup_game_plan_opponent_hero_id_fkey" FOREIGN KEY ("opponent_hero_id") REFERENCES "hero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchup_game_plan" ADD CONSTRAINT "matchup_game_plan_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchup_game_plan_card" ADD CONSTRAINT "matchup_game_plan_card_game_plan_id_fkey" FOREIGN KEY ("game_plan_id") REFERENCES "matchup_game_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchup_game_plan_card" ADD CONSTRAINT "matchup_game_plan_card_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_selection" ADD CONSTRAINT "deck_selection_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_selection" ADD CONSTRAINT "deck_selection_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_selection" ADD CONSTRAINT "deck_selection_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retrospective" ADD CONSTRAINT "retrospective_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retrospective" ADD CONSTRAINT "retrospective_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retrospective" ADD CONSTRAINT "retrospective_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
