-- CreateEnum
CREATE TYPE "SimilarChoiceKind" AS ENUM ('PINNED', 'HIDDEN');

-- AlterEnum
ALTER TYPE "HomeSectionKind" ADD VALUE 'BECAUSE_YOU_WATCHED';

-- CreateTable
CREATE TABLE "similar_choices" (
    "titleId" UUID NOT NULL,
    "otherId" UUID NOT NULL,
    "kind" "SimilarChoiceKind" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "similar_choices_pkey" PRIMARY KEY ("titleId","otherId")
);

-- CreateTable
CREATE TABLE "title_co_watch" (
    "titleId" UUID NOT NULL,
    "otherId" UUID NOT NULL,
    "viewers" INTEGER NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "title_co_watch_pkey" PRIMARY KEY ("titleId","otherId")
);

-- CreateIndex
CREATE INDEX "similar_choices_otherId_idx" ON "similar_choices"("otherId");

-- CreateIndex
CREATE INDEX "title_co_watch_titleId_strength_idx" ON "title_co_watch"("titleId", "strength");

-- CreateIndex
CREATE INDEX "title_co_watch_otherId_idx" ON "title_co_watch"("otherId");

-- CreateIndex
CREATE INDEX "titles_keywords_idx" ON "titles" USING GIN ("keywords");

-- AddForeignKey
ALTER TABLE "similar_choices" ADD CONSTRAINT "similar_choices_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "similar_choices" ADD CONSTRAINT "similar_choices_otherId_fkey" FOREIGN KEY ("otherId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_co_watch" ADD CONSTRAINT "title_co_watch_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_co_watch" ADD CONSTRAINT "title_co_watch_otherId_fkey" FOREIGN KEY ("otherId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

