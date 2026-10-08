-- Existing campaigns and their ledger predicates remain unchanged.
ALTER TABLE "Campaign" ADD COLUMN "renewalOfId" TEXT,
  ADD COLUMN "renewalBudget" DECIMAL(23,7);
CREATE UNIQUE INDEX "Campaign_renewalOfId_key" ON "Campaign"("renewalOfId");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_renewalOfId_fkey"
  FOREIGN KEY ("renewalOfId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
