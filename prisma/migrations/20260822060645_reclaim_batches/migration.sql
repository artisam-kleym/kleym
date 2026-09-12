-- CreateTable
CREATE TABLE "ReclaimBatch" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "balanceCount" INTEGER NOT NULL,
    "amount" DECIMAL(23,7) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReclaimBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReclaimBatch_transactionHash_key" ON "ReclaimBatch"("transactionHash");

-- CreateIndex
CREATE INDEX "ReclaimBatch_campaignId_idx" ON "ReclaimBatch"("campaignId");

-- AddForeignKey
ALTER TABLE "ReclaimBatch" ADD CONSTRAINT "ReclaimBatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
