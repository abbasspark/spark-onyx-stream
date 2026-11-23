-- CreateEnum
CREATE TYPE "PlayKind" AS ENUM ('MAIN', 'TRAILER', 'EXTRA');

-- CreateEnum
CREATE TYPE "PlayDevice" AS ENUM ('DESKTOP', 'MOBILE', 'TABLET', 'TV', 'OTHER');

-- CreateTable
CREATE TABLE "plays" (
    "id" UUID NOT NULL,
    "kind" "PlayKind" NOT NULL DEFAULT 'MAIN',
    "titleId" UUID,
    "episodeId" UUID,
    "viewerId" UUID,
    "visitorKey" TEXT,
    "device" "PlayDevice" NOT NULL DEFAULT 'OTHER',
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastBeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plays_startedAt_idx" ON "plays"("startedAt");

-- CreateIndex
CREATE INDEX "plays_titleId_startedAt_idx" ON "plays"("titleId", "startedAt");

-- CreateIndex
CREATE INDEX "plays_lastBeatAt_idx" ON "plays"("lastBeatAt");

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plays" ADD CONSTRAINT "plays_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

