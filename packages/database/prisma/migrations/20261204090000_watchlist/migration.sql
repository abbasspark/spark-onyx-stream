-- AlterEnum
ALTER TYPE "HomeSectionKind" ADD VALUE 'MY_LIST';

-- CreateTable
CREATE TABLE "watchlist_items" (
    "id" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "titleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "watchlist_items_profileId_createdAt_idx" ON "watchlist_items"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "watchlist_items_viewerId_idx" ON "watchlist_items"("viewerId");

-- CreateIndex
CREATE INDEX "watchlist_items_titleId_idx" ON "watchlist_items"("titleId");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_items_profileId_titleId_key" ON "watchlist_items"("profileId", "titleId");

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "viewer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

