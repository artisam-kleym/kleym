-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('READ', 'WRITE');

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "scope" "ApiKeyScope" NOT NULL DEFAULT 'READ';

-- Every key that exists was issued while v1 was read-only (SPEC.md §6.6 before
-- #51). The DEFAULT above already makes them READ; stated explicitly so the
-- backfill is a decision in the ledger, not a side effect of a default.
UPDATE "ApiKey" SET "scope" = 'READ';
