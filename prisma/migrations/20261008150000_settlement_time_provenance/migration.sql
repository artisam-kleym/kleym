-- Expand only. No timestamps, signed bytes, fees or historical valuations are guessed.
ALTER TABLE "LedgerAttempt" ADD COLUMN "ledgerSettledAt" TIMESTAMP(3), ADD COLUMN "observedAt" TIMESTAMP(3);
ALTER TABLE "ClaimLink" ADD COLUMN "ledgerSettledAt" TIMESTAMP(3), ADD COLUMN "observedAt" TIMESTAMP(3);
ALTER TABLE "ReclaimBatch" ADD COLUMN "ledgerSettledAt" TIMESTAMP(3), ADD COLUMN "observedAt" TIMESTAMP(3);
ALTER TABLE "Valuation" ADD COLUMN "timeSource" TEXT NOT NULL DEFAULT 'legacy-unverified', ADD COLUMN "feeKnown" BOOLEAN NOT NULL DEFAULT false;
