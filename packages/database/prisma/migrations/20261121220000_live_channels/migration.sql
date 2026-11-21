-- CreateEnum
CREATE TYPE "ChannelStatus" AS ENUM ('STOPPED', 'STARTING', 'RUNNING', 'RECONNECTING', 'FAILED');

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "number" INTEGER,
    "description" TEXT,
    "sourceEncrypted" TEXT NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "ChannelStatus" NOT NULL DEFAULT 'STOPPED',
    "statusMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "restartCount" INTEGER NOT NULL DEFAULT 0,
    "restartToken" INTEGER NOT NULL DEFAULT 0,
    "videoCodec" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "frameRate" DOUBLE PRECISION,
    "audioCodec" TEXT,
    "audioChannels" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channels_slug_key" ON "channels"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "channels_number_key" ON "channels"("number");

-- CreateIndex
CREATE INDEX "channels_enabled_idx" ON "channels"("enabled");

