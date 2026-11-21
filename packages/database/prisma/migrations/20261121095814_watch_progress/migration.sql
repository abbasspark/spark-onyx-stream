-- CreateTable
CREATE TABLE "watch_progress" (
    "id" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "titleId" UUID NOT NULL,
    "episodeId" UUID,
    "itemId" UUID NOT NULL,
    "positionSeconds" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "watchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watch_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "watch_progress_viewerId_watchedAt_idx" ON "watch_progress"("viewerId", "watchedAt");

-- CreateIndex
CREATE INDEX "watch_progress_titleId_idx" ON "watch_progress"("titleId");

-- CreateIndex
CREATE INDEX "watch_progress_episodeId_idx" ON "watch_progress"("episodeId");

-- CreateIndex
CREATE UNIQUE INDEX "watch_progress_viewerId_itemId_key" ON "watch_progress"("viewerId", "itemId");

-- AddForeignKey
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
