-- CreateEnum
CREATE TYPE "RunKind" AS ENUM ('SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PREPARED', 'FAILED');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "signedById" TEXT;

-- CreateTable
CREATE TABLE "CampaignTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "terms" JSONB NOT NULL,
    "recipientsCsv" TEXT NOT NULL DEFAULT '',
    "cadence" TEXT,
    "runHour" INTEGER NOT NULL DEFAULT 9,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateRun" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "campaignId" TEXT,
    "kind" "RunKind" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'PREPARED',
    "failure" TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "recipientsCsv" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignTemplate_organizationId_name_idx" ON "CampaignTemplate"("organizationId", "name");

-- CreateIndex
CREATE INDEX "CampaignTemplate_enabled_nextRunAt_idx" ON "CampaignTemplate"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateRun_campaignId_key" ON "TemplateRun"("campaignId");

-- CreateIndex
CREATE INDEX "TemplateRun_templateId_createdAt_idx" ON "TemplateRun"("templateId", "createdAt");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CampaignTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignTemplate" ADD CONSTRAINT "CampaignTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRun" ADD CONSTRAINT "TemplateRun_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CampaignTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateRun" ADD CONSTRAINT "TemplateRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
