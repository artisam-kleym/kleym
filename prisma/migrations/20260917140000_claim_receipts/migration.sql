-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "emailReceipts" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ClaimLink" ADD COLUMN     "deliveredAsset" TEXT,
ADD COLUMN     "deliveredAmount" DECIMAL(23,7);

-- CreateTable
CREATE TABLE "ClaimReceipt" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "canonical" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimReceipt_linkId_key" ON "ClaimReceipt"("linkId");

-- CreateIndex
CREATE INDEX "ClaimReceipt_organizationId_claimedAt_idx" ON "ClaimReceipt"("organizationId", "claimedAt");

-- CreateIndex
CREATE INDEX "ClaimReceipt_campaignId_claimedAt_idx" ON "ClaimReceipt"("campaignId", "claimedAt");

-- AddForeignKey
ALTER TABLE "ClaimReceipt" ADD CONSTRAINT "ClaimReceipt_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ClaimLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
