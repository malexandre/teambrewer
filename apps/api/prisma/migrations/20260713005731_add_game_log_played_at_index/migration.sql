-- CreateIndex
CREATE INDEX "game_log_team_id_played_at_id_idx" ON "game_log"("team_id", "played_at" DESC, "id" DESC);
