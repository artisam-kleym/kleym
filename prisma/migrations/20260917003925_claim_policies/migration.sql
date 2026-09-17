-- CreateEnum
CREATE TYPE "ClaimPolicy" AS ENUM ('OPEN', 'CODE', 'EMAIL', 'PASSKEY');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "claimPolicy" "ClaimPolicy" NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "ClaimLink" ADD COLUMN     "claimedUnder" "ClaimPolicy",
ADD COLUMN     "codeHash" TEXT;

-- CreateTable
CREATE TABLE "ClaimLinkPasskey" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "ClaimLinkPasskey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimLinkPasskey_linkId_key" ON "ClaimLinkPasskey"("linkId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimLinkPasskey_credentialId_key" ON "ClaimLinkPasskey"("credentialId");

-- AddForeignKey
ALTER TABLE "ClaimLinkPasskey" ADD CONSTRAINT "ClaimLinkPasskey_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ClaimLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

