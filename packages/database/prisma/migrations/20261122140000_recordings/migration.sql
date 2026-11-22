-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('SCHEDULED', 'RECORDING', 'FINISHING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "recordings" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "channelId" UUID,
    "channelName" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "RecordingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "statusMessage" TEXT,
    "recordedSeconds" INTEGER,
    "bytes" BIGINT,
    "assetId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recordings_assetId_key" ON "recordings"("assetId");

-- CreateIndex
CREATE INDEX "recordings_status_startsAt_idx" ON "recordings"("status", "startsAt");

-- CreateIndex
CREATE INDEX "recordings_channelId_idx" ON "recordings"("channelId");

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

