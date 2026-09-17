-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "expiringSoonAt" TIMESTAMP(3),
ADD COLUMN     "reminderDaysBefore" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "remindedAt" TIMESTAMP(3),
ADD COLUMN     "reminderPoints" INTEGER[] DEFAULT ARRAY[]::INTEGER[];


-- The reclaim schedule now covers every expired campaign (#78), not only a
-- suspended one (#72). A campaign that expired before this deploy is marked as
-- due at its expiry, so the first sweep after deploying does not fire
-- `campaign.reclaim_due` for every campaign that ever expired; the outstanding
-- panel still shows what it holds, and the sender can still sign the reclaim.
UPDATE "Campaign"
SET "reclaimDueAt" = "expiresAt"
WHERE "reclaimDueAt" IS NULL
  AND "expiresAt" <= now()
  AND "status" IN ('ACTIVE', 'PARTIAL', 'CREATING', 'EXPIRED');
