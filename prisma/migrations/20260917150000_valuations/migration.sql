-- CreateEnum
CREATE TYPE "ValuationKind" AS ENUM ('CLAIM', 'RECLAIM');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "reportingCurrency" TEXT NOT NULL DEFAULT 'USD';

-- CreateTable
CREATE TABLE "Valuation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "linkId" TEXT,
    "reclaimBatchId" TEXT,
    "kind" "ValuationKind" NOT NULL,
    "valuedAt" TIMESTAMP(3) NOT NULL,
    "assetCode" TEXT NOT NULL,
    "assetIssuer" TEXT,
    "amount" DECIMAL(23,7) NOT NULL,
    "feeXlm" DECIMAL(23,7) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "rate" DECIMAL(23,7),
    "xlmRate" DECIMAL(23,7),
    "xlmRateSource" TEXT,
    "xlmRateWindow" TEXT,
    "rateSource" TEXT NOT NULL,
    "rateWindow" TEXT,
    "transactionHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Valuation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Valuation_linkId_key" ON "Valuation"("linkId");

-- CreateIndex
CREATE UNIQUE INDEX "Valuation_reclaimBatchId_key" ON "Valuation"("reclaimBatchId");

-- CreateIndex
CREATE INDEX "Valuation_organizationId_valuedAt_idx" ON "Valuation"("organizationId", "valuedAt");

-- CreateIndex
CREATE INDEX "Valuation_campaignId_valuedAt_idx" ON "Valuation"("campaignId", "valuedAt");

-- CreateIndex
CREATE INDEX "Valuation_rate_valuedAt_idx" ON "Valuation"("rate", "valuedAt");

-- CreateIndex
CREATE INDEX "Valuation_attempts_valuedAt_idx" ON "Valuation"("attempts", "valuedAt");

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ClaimLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_reclaimBatchId_fkey" FOREIGN KEY ("reclaimBatchId") REFERENCES "ReclaimBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
