-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "renewsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "viewers" ADD COLUMN     "stripeCustomerId" TEXT;

-- CreateTable
CREATE TABLE "stripe_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "stripe_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stripe_events_receivedAt_idx" ON "stripe_events"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "viewers_stripeCustomerId_key" ON "viewers"("stripeCustomerId");

