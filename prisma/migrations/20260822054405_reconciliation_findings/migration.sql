-- CreateTable
CREATE TABLE "ReconciliationFinding" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconciliationFinding_severity_resolvedAt_idx" ON "ReconciliationFinding"("severity", "resolvedAt");

-- CreateIndex
CREATE INDEX "ReconciliationFinding_campaignId_idx" ON "ReconciliationFinding"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationFinding_linkId_kind_key" ON "ReconciliationFinding"("linkId", "kind");

-- AddForeignKey
ALTER TABLE "ReconciliationFinding" ADD CONSTRAINT "ReconciliationFinding_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ClaimLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationFinding" ADD CONSTRAINT "ReconciliationFinding_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
