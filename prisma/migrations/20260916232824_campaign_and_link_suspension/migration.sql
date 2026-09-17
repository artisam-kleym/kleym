-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "reclaimDueAt" TIMESTAMP(3),
ADD COLUMN     "suspendedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ClaimLink" ADD COLUMN     "suspendedAt" TIMESTAMP(3);

