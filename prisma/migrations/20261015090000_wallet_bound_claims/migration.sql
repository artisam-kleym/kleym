ALTER TYPE "ClaimPolicy" ADD VALUE 'WALLET';
ALTER TABLE "ClaimLink" ADD COLUMN "recipientPublicKey" TEXT;
