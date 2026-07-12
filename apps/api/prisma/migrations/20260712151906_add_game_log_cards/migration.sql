-- CreateEnum
CREATE TYPE "GameLogCardRole" AS ENUM ('impressive', 'underperforming');

-- CreateEnum
CREATE TYPE "GameLogCardSide" AS ENUM ('ours', 'theirs');

-- CreateTable
CREATE TABLE "game_log_card" (
    "id" TEXT NOT NULL,
    "game_log_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "role" "GameLogCardRole" NOT NULL,
    "side" "GameLogCardSide" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_log_card_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_log_card_game_log_id_idx" ON "game_log_card"("game_log_id");

-- CreateIndex
CREATE INDEX "game_log_card_card_id_idx" ON "game_log_card"("card_id");

-- AddForeignKey
ALTER TABLE "game_log_card" ADD CONSTRAINT "game_log_card_game_log_id_fkey" FOREIGN KEY ("game_log_id") REFERENCES "game_log"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_log_card" ADD CONSTRAINT "game_log_card_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
