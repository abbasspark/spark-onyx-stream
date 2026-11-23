-- CreateEnum
CREATE TYPE "CouponKind" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "CouponScope" AS ENUM ('EVERYTHING', 'SUBSCRIPTIONS', 'TITLES');

-- CreateEnum
CREATE TYPE "CouponDuration" AS ENUM ('ONCE', 'REPEATING', 'FOREVER');

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "note" TEXT,
    "kind" "CouponKind" NOT NULL,
    "percentOff" INTEGER,
    "amountOff" INTEGER,
    "scope" "CouponScope" NOT NULL DEFAULT 'EVERYTHING',
    "duration" "CouponDuration" NOT NULL DEFAULT 'ONCE',
    "durationMonths" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "oncePerViewer" BOOLEAN NOT NULL DEFAULT true,
    "newCustomersOnly" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_plans" (
    "couponId" UUID NOT NULL,
    "planId" UUID NOT NULL,

    CONSTRAINT "coupon_plans_pkey" PRIMARY KEY ("couponId","planId")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" UUID NOT NULL,
    "couponId" UUID NOT NULL,
    "viewerId" UUID,
    "viewerEmail" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "listAmount" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupon_plans_planId_idx" ON "coupon_plans"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_externalId_key" ON "coupon_redemptions"("externalId");

-- CreateIndex
CREATE INDEX "coupon_redemptions_couponId_createdAt_idx" ON "coupon_redemptions"("couponId", "createdAt");

-- CreateIndex
CREATE INDEX "coupon_redemptions_viewerId_idx" ON "coupon_redemptions"("viewerId");

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_plans" ADD CONSTRAINT "coupon_plans_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_plans" ADD CONSTRAINT "coupon_plans_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

