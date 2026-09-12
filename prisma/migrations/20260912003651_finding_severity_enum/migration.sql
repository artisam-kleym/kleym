-- Severity becomes an enum whose DECLARATION ORDER is the display order, so
-- `ORDER BY severity ASC` puts critical findings first by definition rather
-- than by the alphabetical accident the text column happened to rely on
-- (and got wrong: `DESC` on text sorted 'warn' above 'error').
--
-- Hand-edited from Prisma's draft, which dropped and recreated the column.
-- Existing rows hold only 'info' | 'warn' | 'error', so a cast keeps them.
-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('error', 'warn', 'info');

-- AlterTable
DROP INDEX "ReconciliationFinding_severity_resolvedAt_idx";
ALTER TABLE "ReconciliationFinding"
  ALTER COLUMN "severity" TYPE "FindingSeverity" USING ("severity"::"FindingSeverity");

-- CreateIndex
CREATE INDEX "ReconciliationFinding_severity_resolvedAt_idx" ON "ReconciliationFinding"("severity", "resolvedAt");
