-- CreateEnum
CREATE TYPE "WatchAfterImport" AS ENUM ('MOVE', 'KEEP', 'DELETE');

-- CreateEnum
CREATE TYPE "WatchedFileState" AS ENUM ('WAITING', 'UNRECOGNISED', 'QUEUED', 'IMPORTING', 'IMPORTED', 'CONFLICT', 'FAILED', 'IGNORED');

-- CreateTable
CREATE TABLE "watch_locations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "driver" "StorageDriver" NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "scanIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "storagePoolId" UUID,
    "processingMode" "ProcessingMode",
    "encodingProfileId" UUID,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "afterImport" "WatchAfterImport" NOT NULL DEFAULT 'MOVE',
    "lastScanAt" TIMESTAMP(3),
    "lastScanError" TEXT,
    "scanRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watched_files" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "modifiedAt" TIMESTAMP(3) NOT NULL,
    "state" "WatchedFileState" NOT NULL DEFAULT 'WAITING',
    "metadataId" TEXT,
    "seasonNumber" INTEGER,
    "episodeNumber" INTEGER,
    "matchedByHand" BOOLEAN NOT NULL DEFAULT false,
    "replace" BOOLEAN NOT NULL DEFAULT false,
    "titleId" UUID,
    "episodeId" UUID,
    "assetId" UUID,
    "publishPending" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watched_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "watch_locations_name_key" ON "watch_locations"("name");

-- CreateIndex
CREATE INDEX "watched_files_state_idx" ON "watched_files"("state");

-- CreateIndex
CREATE INDEX "watched_files_locationId_state_idx" ON "watched_files"("locationId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "watched_files_locationId_path_key" ON "watched_files"("locationId", "path");

-- AddForeignKey
ALTER TABLE "watch_locations" ADD CONSTRAINT "watch_locations_storagePoolId_fkey" FOREIGN KEY ("storagePoolId") REFERENCES "storage_pools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_locations" ADD CONSTRAINT "watch_locations_encodingProfileId_fkey" FOREIGN KEY ("encodingProfileId") REFERENCES "encoding_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watched_files" ADD CONSTRAINT "watched_files_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "watch_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watched_files" ADD CONSTRAINT "watched_files_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watched_files" ADD CONSTRAINT "watched_files_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watched_files" ADD CONSTRAINT "watched_files_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

