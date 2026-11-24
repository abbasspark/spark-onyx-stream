-- CreateEnum
CREATE TYPE "PlaybackSessionKind" AS ENUM ('VIDEO', 'LIVE');

-- CreateTable
CREATE TABLE "playback_sessions" (
    "id" UUID NOT NULL,
    "kind" "PlaybackSessionKind" NOT NULL,
    "titleId" UUID,
    "episodeId" UUID,
    "channelId" UUID,
    "device" "PlayDevice" NOT NULL DEFAULT 'OTHER',
    "server" TEXT NOT NULL DEFAULT 'origin',
    "player" TEXT,
    "playerVersion" TEXT,
    "startupMs" INTEGER,
    "playedSeconds" INTEGER NOT NULL DEFAULT 0,
    "stallCount" INTEGER NOT NULL DEFAULT 0,
    "stallMs" INTEGER NOT NULL DEFAULT 0,
    "qualityChanges" INTEGER NOT NULL DEFAULT 0,
    "bitrateKbps" INTEGER,
    "height" SMALLINT,
    "droppedFrames" INTEGER NOT NULL DEFAULT 0,
    "recoveredErrors" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "errorAtSeconds" INTEGER,
    "ended" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedAt" TIMESTAMP(3),

    CONSTRAINT "playback_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "playback_sessions_startedAt_idx" ON "playback_sessions"("startedAt");

-- CreateIndex
CREATE INDEX "playback_sessions_titleId_startedAt_idx" ON "playback_sessions"("titleId", "startedAt");

-- CreateIndex
CREATE INDEX "playback_sessions_channelId_startedAt_idx" ON "playback_sessions"("channelId", "startedAt");

-- CreateIndex
CREATE INDEX "playback_sessions_errorCode_startedAt_idx" ON "playback_sessions"("errorCode", "startedAt");

-- AddForeignKey
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playback_sessions" ADD CONSTRAINT "playback_sessions_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

