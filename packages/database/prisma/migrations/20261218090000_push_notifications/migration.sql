-- CreateEnum
CREATE TYPE "PushProvider" AS ENUM ('WEB', 'FCM');

-- CreateEnum
CREATE TYPE "NotificationTopic" AS ENUM ('NEW_EPISODES', 'NEW_TITLES', 'ANNOUNCEMENTS');

-- CreateEnum
CREATE TYPE "PushState" AS ENUM ('NONE', 'PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignAudience" AS ENUM ('EVERYONE', 'SUBSCRIBERS', 'NOT_SUBSCRIBED', 'PLAN');

-- AlterTable
ALTER TABLE "episodes" ADD COLUMN     "announcedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "titles" ADD COLUMN     "announcedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "viewers" ADD COLUMN     "mutedTopics" "NotificationTopic"[] DEFAULT ARRAY[]::"NotificationTopic"[];

-- CreateTable
CREATE TABLE "push_devices" (
    "id" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "provider" "PushProvider" NOT NULL,
    "token" TEXT NOT NULL,
    "p256dh" TEXT,
    "auth" TEXT,
    "tokenHash" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "language" TEXT,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "topic" "NotificationTopic" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageUrl" TEXT,
    "link" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "campaignId" UUID,
    "dedupeKey" TEXT,
    "pushState" "PushState" NOT NULL DEFAULT 'NONE',
    "pushAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "devices" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_campaigns" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "titleId" UUID,
    "link" TEXT,
    "audience" "CampaignAudience" NOT NULL DEFAULT 'EVERYONE',
    "planId" UUID,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_devices_tokenHash_key" ON "push_devices"("tokenHash");

-- CreateIndex
CREATE INDEX "push_devices_viewerId_idx" ON "push_devices"("viewerId");

-- CreateIndex
CREATE INDEX "push_devices_sessionId_idx" ON "push_devices"("sessionId");

-- CreateIndex
CREATE INDEX "notifications_viewerId_createdAt_idx" ON "notifications"("viewerId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_pushState_nextAttemptAt_idx" ON "notifications"("pushState", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "notifications_campaignId_idx" ON "notifications"("campaignId");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_viewerId_dedupeKey_key" ON "notifications"("viewerId", "dedupeKey");

-- CreateIndex
CREATE INDEX "push_campaigns_status_scheduledAt_idx" ON "push_campaigns"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "push_campaigns_createdAt_idx" ON "push_campaigns"("createdAt");

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "viewer_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "push_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_campaigns" ADD CONSTRAINT "push_campaigns_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_campaigns" ADD CONSTRAINT "push_campaigns_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- What is published already was never announced and is not news: viewers
-- are told about what is published from now on.
UPDATE "titles" SET "announcedAt" = CURRENT_TIMESTAMP WHERE "status" = 'PUBLISHED';
UPDATE "episodes" SET "announcedAt" = CURRENT_TIMESTAMP WHERE "status" = 'PUBLISHED';
