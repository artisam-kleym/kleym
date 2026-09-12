-- Organisations, memberships and roles (#44).
--
-- Hand-edited from Prisma's draft, which added NOT NULL columns with no
-- default and so could not run against a populated database. The order here
-- is: create the new tables; give EVERY existing user a personal organisation
-- with an OWNER membership; add the new columns nullable; backfill each row
-- from its user's personal organisation; then tighten to NOT NULL. A
-- single-user deployment ends up behaving exactly as before: one user, one
-- organisation, every row in it.

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('VIEWER', 'OPERATOR', 'APPROVER', 'OWNER');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'OPERATOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: a personal organisation per existing user, owned by them.
-- The organisation id is derived from the user id so the backfill is
-- idempotent and the rows below can join on it without a temp table.
INSERT INTO "Organization" ("id", "name", "createdAt", "updatedAt")
SELECT 'org_' || u."id", u."username", u."createdAt", CURRENT_TIMESTAMP
FROM "User" u
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Membership" ("id", "organizationId", "userId", "role", "createdAt")
SELECT 'mem_' || u."id", 'org_' || u."id", u."id", 'OWNER', u."createdAt"
FROM "User" u
ON CONFLICT ("organizationId", "userId") DO NOTHING;

-- AlterTable: new columns, nullable for the backfill.
ALTER TABLE "ApiKey" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Invitation" ADD COLUMN "organizationId" TEXT,
                         ADD COLUMN "role" "OrgRole" NOT NULL DEFAULT 'OPERATOR';
ALTER TABLE "AuditLog" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Session" ADD COLUMN "activeOrganizationId" TEXT;

-- Backfill 2: every row into its user's personal organisation.
UPDATE "Campaign" SET "organizationId" = 'org_' || "userId" WHERE "organizationId" IS NULL;
UPDATE "ApiKey" SET "organizationId" = 'org_' || "userId" WHERE "organizationId" IS NULL;
-- A pending invitation joins the INVITER's organisation, as an Operator.
UPDATE "Invitation" SET "organizationId" = 'org_' || "createdById" WHERE "organizationId" IS NULL;
-- Audit rows: the actor's organisation, where there was an actor.
UPDATE "AuditLog" SET "organizationId" = 'org_' || "userId" WHERE "organizationId" IS NULL AND "userId" IS NOT NULL;

-- Tighten.
ALTER TABLE "ApiKey" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Campaign" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Invitation" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "ApiKey_organizationId_idx" ON "ApiKey"("organizationId");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "Campaign_organizationId_status_idx" ON "Campaign"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
