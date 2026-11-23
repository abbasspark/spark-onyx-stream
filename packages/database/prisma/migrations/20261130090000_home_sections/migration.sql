-- CreateEnum
CREATE TYPE "HomeSectionKind" AS ENUM ('HERO', 'CONTINUE_WATCHING', 'TITLES');

-- CreateEnum
CREATE TYPE "HomeSource" AS ENUM ('ALL', 'FEATURED', 'CATEGORY', 'GENRE', 'COLLECTION', 'MANUAL');

-- CreateEnum
CREATE TYPE "HomeSort" AS ENUM ('CURATED', 'NEWEST', 'RELEASED', 'RATING', 'NAME');

-- CreateEnum
CREATE TYPE "HomeLayout" AS ENUM ('POSTER', 'LANDSCAPE', 'NUMBERED');

-- CreateTable
CREATE TABLE "home_sections" (
    "id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "kind" "HomeSectionKind" NOT NULL,
    "name" TEXT,
    "source" "HomeSource" NOT NULL DEFAULT 'ALL',
    "categoryId" UUID,
    "genreId" UUID,
    "collectionId" UUID,
    "titleType" "TitleType",
    "sort" "HomeSort" NOT NULL DEFAULT 'NEWEST',
    "limit" INTEGER NOT NULL DEFAULT 20,
    "layout" "HomeLayout" NOT NULL DEFAULT 'POSTER',
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "visibleFrom" TIMESTAMP(3),
    "visibleUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_section_titles" (
    "sectionId" UUID NOT NULL,
    "titleId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "home_section_titles_pkey" PRIMARY KEY ("sectionId","titleId")
);

-- CreateIndex
CREATE INDEX "home_sections_position_idx" ON "home_sections"("position");

-- CreateIndex
CREATE INDEX "home_section_titles_titleId_idx" ON "home_section_titles"("titleId");

-- AddForeignKey
ALTER TABLE "home_sections" ADD CONSTRAINT "home_sections_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_sections" ADD CONSTRAINT "home_sections_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_sections" ADD CONSTRAINT "home_sections_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_section_titles" ADD CONSTRAINT "home_section_titles_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "home_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_section_titles" ADD CONSTRAINT "home_section_titles_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

