-- AlterEnum
ALTER TYPE "SubscriptionSource" ADD VALUE 'PREPAID';

-- CreateTable
CREATE TABLE "prepaid_batches" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "planId" UUID NOT NULL,
    "days" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prepaid_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prepaid_codes" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "codeBox" TEXT NOT NULL,
    "ending" TEXT NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "redeemedById" UUID,
    "subscriptionId" UUID,
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "prepaid_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prepaid_batches_createdAt_idx" ON "prepaid_batches"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "prepaid_codes_codeHash_key" ON "prepaid_codes"("codeHash");

-- CreateIndex
CREATE INDEX "prepaid_codes_batchId_redeemedAt_idx" ON "prepaid_codes"("batchId", "redeemedAt");

-- CreateIndex
CREATE INDEX "prepaid_codes_redeemedById_idx" ON "prepaid_codes"("redeemedById");

-- AddForeignKey
ALTER TABLE "prepaid_batches" ADD CONSTRAINT "prepaid_batches_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepaid_codes" ADD CONSTRAINT "prepaid_codes_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "prepaid_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepaid_codes" ADD CONSTRAINT "prepaid_codes_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "viewers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepaid_codes" ADD CONSTRAINT "prepaid_codes_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

