-- AlterTable
ALTER TABLE "deck_meta" ADD COLUMN     "meta_deck_entry_id" TEXT;

-- CreateIndex
CREATE INDEX "deck_meta_meta_deck_entry_id_idx" ON "deck_meta"("meta_deck_entry_id");

-- AddForeignKey
ALTER TABLE "deck_meta" ADD CONSTRAINT "deck_meta_meta_deck_entry_id_fkey" FOREIGN KEY ("meta_deck_entry_id") REFERENCES "meta_deck_entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
