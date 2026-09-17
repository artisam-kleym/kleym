-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "expiringSoonAt" TIMESTAMP(3),
ADD COLUMN     "reminderDaysBefore" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "remindedAt" TIMESTAMP(3),
ADD COLUMN     "reminderPoints" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

