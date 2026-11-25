-- CreateEnum
CREATE TYPE "AdSourceKind" AS ENUM ('VAST_TAG', 'HOUSE');

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "removesAds" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ad_sources" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AdSourceKind" NOT NULL,
    "vastUrl" TEXT,
    "assetId" UUID,
    "clickUrl" TEXT,
    "skipAfterSeconds" INTEGER,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_stats" (
    "sourceId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "firstQuartile" INTEGER NOT NULL DEFAULT 0,
    "midpoint" INTEGER NOT NULL DEFAULT 0,
    "thirdQuartile" INTEGER NOT NULL DEFAULT 0,
    "completes" INTEGER NOT NULL DEFAULT 0,
    "skips" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ad_stats_pkey" PRIMARY KEY ("sourceId","day")
);

-- CreateIndex
CREATE INDEX "ad_sources_isActive_idx" ON "ad_sources"("isActive");

-- CreateIndex
CREATE INDEX "ad_sources_assetId_idx" ON "ad_sources"("assetId");

-- CreateIndex
CREATE INDEX "ad_stats_day_idx" ON "ad_stats"("day");

-- AddForeignKey
ALTER TABLE "ad_sources" ADD CONSTRAINT "ad_sources_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_stats" ADD CONSTRAINT "ad_stats_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ad_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

