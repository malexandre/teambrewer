-- CreateTable
CREATE TABLE "game" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "format" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_constructed" BOOLEAN NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "format_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classes" TEXT[],
    "talents" TEXT[],
    "starting_life" INTEGER,
    "image_url" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pitch" INTEGER,
    "image_url" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_data_version" (
    "game_id" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "source_version" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "card_count" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_data_version_pkey" PRIMARY KEY ("game_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_key_key" ON "game"("key");

-- CreateIndex
CREATE INDEX "format_game_id_idx" ON "format"("game_id");

-- CreateIndex
CREATE UNIQUE INDEX "format_game_id_key_key" ON "format"("game_id", "key");

-- CreateIndex
CREATE INDEX "hero_game_id_name_idx" ON "hero"("game_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "hero_game_id_external_id_key" ON "hero"("game_id", "external_id");

-- CreateIndex
CREATE INDEX "card_game_id_name_idx" ON "card"("game_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "card_game_id_external_id_key" ON "card"("game_id", "external_id");

-- AddForeignKey
ALTER TABLE "format" ADD CONSTRAINT "format_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hero" ADD CONSTRAINT "hero_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card" ADD CONSTRAINT "card_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_data_version" ADD CONSTRAINT "card_data_version_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
