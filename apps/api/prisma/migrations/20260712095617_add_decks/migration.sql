-- CreateEnum
CREATE TYPE "DeckStatus" AS ENUM ('exploratory', 'testing', 'tournament_ready', 'retired');

-- CreateEnum
CREATE TYPE "DeckVisibility" AS ENUM ('team', 'private');

-- CreateTable
CREATE TABLE "deck" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "format_id" TEXT NOT NULL,
    "hero_id" TEXT,
    "external_url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "status" "DeckStatus" NOT NULL DEFAULT 'exploratory',
    "visibility" "DeckVisibility" NOT NULL DEFAULT 'team',
    "is_reference" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "notes" TEXT NOT NULL DEFAULT '',
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deck_iteration_entry" (
    "id" TEXT NOT NULL,
    "deck_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deck_iteration_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deck_team_id_idx" ON "deck"("team_id");

-- CreateIndex
CREATE INDEX "deck_team_id_status_idx" ON "deck"("team_id", "status");

-- CreateIndex
CREATE INDEX "deck_team_id_hero_id_idx" ON "deck"("team_id", "hero_id");

-- CreateIndex
CREATE INDEX "deck_team_id_format_id_idx" ON "deck"("team_id", "format_id");

-- CreateIndex
CREATE INDEX "deck_iteration_entry_deck_id_created_at_idx" ON "deck_iteration_entry"("deck_id", "created_at");

-- AddForeignKey
ALTER TABLE "deck" ADD CONSTRAINT "deck_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck" ADD CONSTRAINT "deck_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck" ADD CONSTRAINT "deck_format_id_fkey" FOREIGN KEY ("format_id") REFERENCES "format"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck" ADD CONSTRAINT "deck_hero_id_fkey" FOREIGN KEY ("hero_id") REFERENCES "hero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck" ADD CONSTRAINT "deck_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_iteration_entry" ADD CONSTRAINT "deck_iteration_entry_deck_id_fkey" FOREIGN KEY ("deck_id") REFERENCES "deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deck_iteration_entry" ADD CONSTRAINT "deck_iteration_entry_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
