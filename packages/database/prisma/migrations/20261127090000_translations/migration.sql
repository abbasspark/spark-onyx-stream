-- CreateTable
CREATE TABLE "title_translations" (
    "titleId" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT,
    "tagline" TEXT,
    "synopsis" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "title_translations_pkey" PRIMARY KEY ("titleId","language")
);

-- CreateTable
CREATE TABLE "season_translations" (
    "seasonId" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT,
    "synopsis" TEXT,

    CONSTRAINT "season_translations_pkey" PRIMARY KEY ("seasonId","language")
);

-- CreateTable
CREATE TABLE "episode_translations" (
    "episodeId" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT,
    "synopsis" TEXT,

    CONSTRAINT "episode_translations_pkey" PRIMARY KEY ("episodeId","language")
);

-- CreateIndex
CREATE INDEX "title_translations_language_idx" ON "title_translations"("language");

-- AddForeignKey
ALTER TABLE "title_translations" ADD CONSTRAINT "title_translations_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_translations" ADD CONSTRAINT "season_translations_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_translations" ADD CONSTRAINT "episode_translations_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

