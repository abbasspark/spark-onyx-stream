-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "guideId" TEXT;

-- CreateTable
CREATE TABLE "guide_sources" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "urlEncrypted" TEXT NOT NULL,
    "urlLabel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastOk" BOOLEAN,
    "lastMessage" TEXT,
    "lastProgrammes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guide_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guide_source_channels" (
    "sourceId" UUID NOT NULL,
    "guideId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "guide_source_channels_pkey" PRIMARY KEY ("sourceId","guideId")
);

-- CreateTable
CREATE TABLE "programmes" (
    "id" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "sourceId" UUID,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "category" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programmes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guide_sources_name_key" ON "guide_sources"("name");

-- CreateIndex
CREATE INDEX "guide_source_channels_guideId_idx" ON "guide_source_channels"("guideId");

-- CreateIndex
CREATE INDEX "programmes_channelId_startsAt_idx" ON "programmes"("channelId", "startsAt");

-- CreateIndex
CREATE INDEX "programmes_channelId_endsAt_idx" ON "programmes"("channelId", "endsAt");

-- CreateIndex
CREATE INDEX "programmes_sourceId_idx" ON "programmes"("sourceId");

-- AddForeignKey
ALTER TABLE "guide_source_channels" ADD CONSTRAINT "guide_source_channels_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "guide_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programmes" ADD CONSTRAINT "programmes_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "guide_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

