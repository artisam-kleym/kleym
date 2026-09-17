-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "allowExchangeDeposit" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ClaimLink" ADD COLUMN     "claimMemo" TEXT,
ADD COLUMN     "claimMemoType" TEXT;

