-- CreateEnum
CREATE TYPE "MfaPolicy" AS ENUM ('OFF', 'APPROVERS', 'ALL');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "mfaPolicy" "MfaPolicy" NOT NULL DEFAULT 'OFF';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "mfaAt" TIMESTAMP(3),
ADD COLUMN     "stepUpAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MfaTotp" (
    "userId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaTotp_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "MfaPasskey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "MfaPasskey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MfaPasskey_credentialId_key" ON "MfaPasskey"("credentialId");

-- CreateIndex
CREATE INDEX "MfaPasskey_userId_idx" ON "MfaPasskey"("userId");

-- CreateIndex
CREATE INDEX "MfaRecoveryCode_userId_idx" ON "MfaRecoveryCode"("userId");

-- AddForeignKey
ALTER TABLE "MfaTotp" ADD CONSTRAINT "MfaTotp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaPasskey" ADD CONSTRAINT "MfaPasskey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
