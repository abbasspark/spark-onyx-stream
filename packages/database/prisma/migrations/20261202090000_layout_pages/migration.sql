-- CreateEnum
CREATE TYPE "LayoutPage" AS ENUM ('HOME', 'MOVIES', 'SERIES');

-- DropIndex
DROP INDEX "home_sections_position_idx";

-- AlterTable
ALTER TABLE "home_sections" ADD COLUMN     "page" "LayoutPage" NOT NULL DEFAULT 'HOME';

-- CreateIndex
CREATE INDEX "home_sections_page_position_idx" ON "home_sections"("page", "position");

