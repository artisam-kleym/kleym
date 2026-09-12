-- CreateEnum
CREATE TYPE "ScreeningDecision" AS ENUM ('ALLOW', 'HOLD', 'BLOCK');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "screenedAt" TIMESTAMP(3),
ADD COLUMN     "screeningDecision" "ScreeningDecision",
ADD COLUMN     "screeningHash" TEXT,
ADD COLUMN     "screeningReason" TEXT;

-- AlterTable
ALTER TABLE "ClaimLink" ADD COLUMN     "category" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "reference" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "screeningUrl" TEXT;
