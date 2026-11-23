-- CreateEnum
CREATE TYPE "ExtraKind" AS ENUM ('TRAILER', 'TEASER', 'CLIP', 'FEATURETTE', 'BEHIND_THE_SCENES', 'INTERVIEW', 'BLOOPERS');

-- AlterTable
ALTER TABLE "titles" ADD COLUMN     "availableFrom" TIMESTAMP(3),
ADD COLUMN     "availableUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "title_extras" (
    "id" UUID NOT NULL,
    "titleId" UUID NOT NULL,
    "kind" "ExtraKind" NOT NULL DEFAULT 'TRAILER',
    "name" TEXT NOT NULL,
    "assetId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "title_extras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL DEFAULT '',
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "posterId" UUID,
    "backdropId" UUID,
    "metadataSource" TEXT,
    "metadataId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_titles" (
    "collectionId" UUID NOT NULL,
    "titleId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "collection_titles_pkey" PRIMARY KEY ("collectionId","titleId")
);

-- CreateIndex
CREATE INDEX "title_extras_titleId_position_idx" ON "title_extras"("titleId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "title_extras_titleId_assetId_key" ON "title_extras"("titleId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "collections_slug_key" ON "collections"("slug");

-- CreateIndex
CREATE INDEX "collections_position_idx" ON "collections"("position");

-- CreateIndex
CREATE UNIQUE INDEX "collections_metadataSource_metadataId_key" ON "collections"("metadataSource", "metadataId");

-- CreateIndex
CREATE INDEX "collection_titles_titleId_idx" ON "collection_titles"("titleId");

-- CreateIndex
CREATE INDEX "titles_availableFrom_idx" ON "titles"("availableFrom");

-- CreateIndex
CREATE INDEX "titles_availableUntil_idx" ON "titles"("availableUntil");

-- AddForeignKey
ALTER TABLE "title_extras" ADD CONSTRAINT "title_extras_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_extras" ADD CONSTRAINT "title_extras_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_backdropId_fkey" FOREIGN KEY ("backdropId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_titles" ADD CONSTRAINT "collection_titles_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_titles" ADD CONSTRAINT "collection_titles_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

