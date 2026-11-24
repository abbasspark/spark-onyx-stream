-- CreateEnum
CREATE TYPE "MarkerKind" AS ENUM ('RECAP', 'INTRO', 'CREDITS');

-- CreateEnum
CREATE TYPE "MarkerSource" AS ENUM ('MANUAL', 'DETECTED');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'MARKERS';

-- CreateTable
CREATE TABLE "asset_markers" (
    "id" UUID NOT NULL,
    "assetId" UUID NOT NULL,
    "kind" "MarkerKind" NOT NULL,
    "startMs" INTEGER NOT NULL,
    "endMs" INTEGER,
    "source" "MarkerSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_markers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_markers_assetId_idx" ON "asset_markers"("assetId");

-- AddForeignKey
ALTER TABLE "asset_markers" ADD CONSTRAINT "asset_markers_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

