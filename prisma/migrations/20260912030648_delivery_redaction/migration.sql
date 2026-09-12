-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "redactedAt" TIMESTAMP(3),
ALTER COLUMN "email" DROP NOT NULL;
