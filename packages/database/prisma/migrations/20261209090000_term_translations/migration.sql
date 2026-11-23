-- CreateTable
CREATE TABLE "category_translations" (
    "categoryId" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("categoryId","language")
);

-- CreateTable
CREATE TABLE "genre_translations" (
    "genreId" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genre_translations_pkey" PRIMARY KEY ("genreId","language")
);

-- CreateTable
CREATE TABLE "collection_translations" (
    "collectionId" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT,
    "synopsis" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_translations_pkey" PRIMARY KEY ("collectionId","language")
);

-- CreateTable
CREATE TABLE "person_translations" (
    "personId" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "name" TEXT,
    "knownFor" TEXT,
    "biography" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_translations_pkey" PRIMARY KEY ("personId","language")
);

-- CreateIndex
CREATE INDEX "category_translations_language_idx" ON "category_translations"("language");

-- CreateIndex
CREATE INDEX "genre_translations_language_idx" ON "genre_translations"("language");

-- CreateIndex
CREATE INDEX "collection_translations_language_idx" ON "collection_translations"("language");

-- CreateIndex
CREATE INDEX "person_translations_language_idx" ON "person_translations"("language");

-- AddForeignKey
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "genre_translations" ADD CONSTRAINT "genre_translations_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_translations" ADD CONSTRAINT "collection_translations_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_translations" ADD CONSTRAINT "person_translations_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

