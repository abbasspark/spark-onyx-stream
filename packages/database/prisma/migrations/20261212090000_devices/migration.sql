-- CreateEnum
CREATE TYPE "DeviceCodeStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'USED');

-- AlterTable
ALTER TABLE "viewer_sessions" ADD COLUMN     "deviceId" UUID;

-- CreateTable
CREATE TABLE "viewer_devices" (
    "id" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "installationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PlayDevice" NOT NULL DEFAULT 'OTHER',
    "platform" TEXT NOT NULL,
    "model" TEXT,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viewer_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_codes" (
    "id" UUID NOT NULL,
    "deviceCodeHash" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "status" "DeviceCodeStatus" NOT NULL DEFAULT 'PENDING',
    "viewerId" UUID,
    "installationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PlayDevice" NOT NULL DEFAULT 'TV',
    "platform" TEXT NOT NULL,
    "model" TEXT,
    "appVersion" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "lastPolledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "viewer_devices_viewerId_installationId_key" ON "viewer_devices"("viewerId", "installationId");

-- CreateIndex
CREATE UNIQUE INDEX "device_codes_deviceCodeHash_key" ON "device_codes"("deviceCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "device_codes_userCode_key" ON "device_codes"("userCode");

-- CreateIndex
CREATE INDEX "device_codes_expiresAt_idx" ON "device_codes"("expiresAt");

-- CreateIndex
CREATE INDEX "viewer_sessions_deviceId_idx" ON "viewer_sessions"("deviceId");

-- AddForeignKey
ALTER TABLE "viewer_sessions" ADD CONSTRAINT "viewer_sessions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "viewer_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewer_devices" ADD CONSTRAINT "viewer_devices_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_codes" ADD CONSTRAINT "device_codes_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

