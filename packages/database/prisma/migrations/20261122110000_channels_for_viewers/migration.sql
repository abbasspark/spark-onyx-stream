-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "access" "TitleAccess" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "published" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "channel_packages" (
    "channelId" UUID NOT NULL,
    "packageId" UUID NOT NULL,

    CONSTRAINT "channel_packages_pkey" PRIMARY KEY ("channelId","packageId")
);

-- CreateIndex
CREATE INDEX "channel_packages_packageId_idx" ON "channel_packages"("packageId");

-- AddForeignKey
ALTER TABLE "channel_packages" ADD CONSTRAINT "channel_packages_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_packages" ADD CONSTRAINT "channel_packages_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

