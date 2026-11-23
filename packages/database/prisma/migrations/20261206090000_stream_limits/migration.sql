-- CreateEnum
CREATE TYPE "StreamKind" AS ENUM ('VIDEO', 'LIVE');

-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "maxStreams" INTEGER;

-- AlterTable
ALTER TABLE "viewers" ADD COLUMN     "maxStreams" INTEGER;

-- CreateTable
CREATE TABLE "viewer_streams" (
    "id" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "profileId" UUID,
    "kind" "StreamKind" NOT NULL,
    "subject" TEXT NOT NULL,
    "device" "PlayDevice" NOT NULL DEFAULT 'OTHER',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viewer_streams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "viewer_streams_viewerId_lastSeenAt_idx" ON "viewer_streams"("viewerId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "viewer_streams_sessionId_idx" ON "viewer_streams"("sessionId");

-- CreateIndex
CREATE INDEX "viewer_streams_lastSeenAt_idx" ON "viewer_streams"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "viewer_streams" ADD CONSTRAINT "viewer_streams_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewer_streams" ADD CONSTRAINT "viewer_streams_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "viewer_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewer_streams" ADD CONSTRAINT "viewer_streams_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "viewer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

