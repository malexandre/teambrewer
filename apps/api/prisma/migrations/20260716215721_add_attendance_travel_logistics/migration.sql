-- CreateEnum
CREATE TYPE "TravelLegStatus" AS ENUM ('sorted', 'searching', 'not_needed');

-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "lodging_detail" TEXT,
ADD COLUMN     "lodging_status" "TravelLegStatus",
ADD COLUMN     "outbound_transport_detail" TEXT,
ADD COLUMN     "outbound_transport_status" "TravelLegStatus",
ADD COLUMN     "return_transport_detail" TEXT,
ADD COLUMN     "return_transport_status" "TravelLegStatus";
