-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('SUBSCRIPTION', 'RENTAL', 'PURCHASE');

-- CreateEnum
CREATE TYPE "PurchaseKind" AS ENUM ('RENT', 'BUY');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'SUBSCRIPTION',
ADD COLUMN     "titleId" UUID,
ADD COLUMN     "titleName" TEXT;

-- AlterTable
ALTER TABLE "titles" ADD COLUMN     "buyAmount" INTEGER,
ADD COLUMN     "purchaseOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rentAmount" INTEGER;

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "titleId" UUID NOT NULL,
    "kind" "PurchaseKind" NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "SubscriptionSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "paymentId" UUID,
    "externalId" TEXT,
    "note" TEXT,
    "grantedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchases_paymentId_key" ON "purchases"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_externalId_key" ON "purchases"("externalId");

-- CreateIndex
CREATE INDEX "purchases_viewerId_titleId_idx" ON "purchases"("viewerId", "titleId");

-- CreateIndex
CREATE INDEX "purchases_titleId_idx" ON "purchases"("titleId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

