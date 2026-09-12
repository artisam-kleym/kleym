-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "approvalThreshold" DECIMAL(23,7),
ADD COLUMN     "approvalsRequired" INTEGER NOT NULL DEFAULT 1;

-- Backfill: campaigns that exist take their organisation's CURRENT policy as
-- their snapshot. Any campaign already gated stays gated by the same numbers.
UPDATE "Campaign" c
SET "approvalThreshold" = o."approvalThreshold",
    "approvalsRequired" = o."approvalsRequired"
FROM "Organization" o
WHERE o."id" = c."organizationId";
