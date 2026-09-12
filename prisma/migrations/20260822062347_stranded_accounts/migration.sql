-- CreateTable
CREATE TABLE "StrandedAccount" (
    "linkId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "ephemeralPublicKey" TEXT NOT NULL,
    "lockedReserve" DECIMAL(23,7) NOT NULL,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "detail" TEXT NOT NULL,
    "lastLedgerActivity" TIMESTAMP(3) NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrandedAccount_pkey" PRIMARY KEY ("linkId")
);

-- CreateIndex
CREATE INDEX "StrandedAccount_critical_idx" ON "StrandedAccount"("critical");

-- CreateIndex
CREATE INDEX "StrandedAccount_campaignId_idx" ON "StrandedAccount"("campaignId");

-- AddForeignKey
ALTER TABLE "StrandedAccount" ADD CONSTRAINT "StrandedAccount_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ClaimLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrandedAccount" ADD CONSTRAINT "StrandedAccount_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
