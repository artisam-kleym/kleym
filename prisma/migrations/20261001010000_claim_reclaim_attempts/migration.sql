CREATE TABLE "LedgerAttempt" (
    "scope" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "preparedXdr" TEXT NOT NULL,
    "submittedXdr" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "metadata" JSONB NOT NULL,
    "ledger" INTEGER,
    "resultXdr" TEXT,
    "feeCharged" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LedgerAttempt_pkey" PRIMARY KEY ("scope")
);
CREATE UNIQUE INDEX "LedgerAttempt_transactionHash_key" ON "LedgerAttempt"("transactionHash");
CREATE INDEX "LedgerAttempt_status_kind_idx" ON "LedgerAttempt"("status", "kind");
ALTER TABLE "LedgerAttempt" ADD CONSTRAINT "LedgerAttempt_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
