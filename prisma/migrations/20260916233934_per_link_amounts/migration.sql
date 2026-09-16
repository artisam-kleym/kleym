-- Per-link amounts (#73).
--
-- Added NULLABLE, backfilled from the owning campaign's amountPerLink, then
-- made NOT NULL — so no existing row is ever ambiguous about what it pays,
-- and a plain ADD COLUMN ... NOT NULL (which fails on a non-empty table with
-- no default, and a default of 0 would be a lie about money) is avoided.
-- Decimal(23,7), never Float: SPEC.md §4.1 invariant 2.

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "variableAmounts" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ClaimLink" ADD COLUMN     "amount" DECIMAL(23,7);

-- Backfill: every existing link pays its campaign's uniform amount.
UPDATE "ClaimLink" AS l
SET "amount" = c."amountPerLink"
FROM "Campaign" AS c
WHERE l."campaignId" = c."id" AND l."amount" IS NULL;

ALTER TABLE "ClaimLink" ALTER COLUMN "amount" SET NOT NULL;
