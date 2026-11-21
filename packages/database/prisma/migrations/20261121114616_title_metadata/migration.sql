-- AlterTable
ALTER TABLE "titles" ADD COLUMN     "metadataId" TEXT,
ADD COLUMN     "metadataLanguage" TEXT,
ADD COLUMN     "metadataSource" TEXT,
ADD COLUMN     "metadataSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "titles_metadataSource_metadataId_idx" ON "titles"("metadataSource", "metadataId");
