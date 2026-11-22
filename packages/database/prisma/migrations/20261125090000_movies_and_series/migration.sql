-- CreateEnum
CREATE TYPE "SeriesStatus" AS ENUM ('UPCOMING', 'RUNNING', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreditKind" AS ENUM ('CAST', 'CREW');

-- AlterEnum
ALTER TYPE "ImageKind" ADD VALUE 'PORTRAIT';

-- AlterTable
ALTER TABLE "episodes" ADD COLUMN     "airDate" DATE,
ADD COLUMN     "runtimeMinutes" INTEGER;

-- AlterTable
ALTER TABLE "seasons" ADD COLUMN     "airDate" DATE,
ADD COLUMN     "posterId" UUID;

-- AlterTable
ALTER TABLE "titles" ADD COLUMN     "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "imdbId" TEXT,
ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lastAirDate" DATE,
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "ratingCount" INTEGER,
ADD COLUMN     "releaseDate" DATE,
ADD COLUMN     "runtimeMinutes" INTEGER,
ADD COLUMN     "seriesStatus" "SeriesStatus",
ADD COLUMN     "studios" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "genres" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_genres" (
    "titleId" UUID NOT NULL,
    "genreId" UUID NOT NULL,

    CONSTRAINT "title_genres_pkey" PRIMARY KEY ("titleId","genreId")
);

-- CreateTable
CREATE TABLE "people" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "knownFor" TEXT,
    "biography" TEXT,
    "metadataSource" TEXT,
    "metadataId" TEXT,
    "portraitId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credits" (
    "id" UUID NOT NULL,
    "titleId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "kind" "CreditKind" NOT NULL,
    "role" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "genres_slug_key" ON "genres"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "genres_name_key" ON "genres"("name");

-- CreateIndex
CREATE INDEX "title_genres_genreId_idx" ON "title_genres"("genreId");

-- CreateIndex
CREATE UNIQUE INDEX "people_slug_key" ON "people"("slug");

-- CreateIndex
CREATE INDEX "people_name_idx" ON "people"("name");

-- CreateIndex
CREATE UNIQUE INDEX "people_metadataSource_metadataId_key" ON "people"("metadataSource", "metadataId");

-- CreateIndex
CREATE INDEX "credits_titleId_kind_position_idx" ON "credits"("titleId", "kind", "position");

-- CreateIndex
CREATE INDEX "credits_personId_idx" ON "credits"("personId");

-- CreateIndex
CREATE INDEX "titles_type_releaseDate_idx" ON "titles"("type", "releaseDate");

-- AddForeignKey
ALTER TABLE "title_genres" ADD CONSTRAINT "title_genres_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_genres" ADD CONSTRAINT "title_genres_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_portraitId_fkey" FOREIGN KEY ("portraitId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

