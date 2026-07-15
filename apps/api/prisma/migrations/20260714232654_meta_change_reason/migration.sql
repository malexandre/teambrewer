-- CreateEnum
CREATE TYPE "MetaChangeReason" AS ENUM ('ban_list', 'living_legend', 'product_release');

-- AlterTable
ALTER TABLE "meta" ADD COLUMN     "change_reason" "MetaChangeReason",
ADD COLUMN     "change_reason_hero_id" TEXT,
ADD COLUMN     "change_reason_image_url" TEXT;

-- AddForeignKey
ALTER TABLE "meta" ADD CONSTRAINT "meta_change_reason_hero_id_fkey" FOREIGN KEY ("change_reason_hero_id") REFERENCES "hero"("id") ON DELETE SET NULL ON UPDATE CASCADE;
