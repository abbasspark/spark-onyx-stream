-- CreateEnum
CREATE TYPE "ChannelMode" AS ENUM ('COPY', 'TRANSCODE');

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "mode" "ChannelMode" NOT NULL DEFAULT 'COPY',
ADD COLUMN     "qualities" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

