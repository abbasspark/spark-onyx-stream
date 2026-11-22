-- CreateTable
CREATE TABLE "edge_servers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "location" TEXT,
    "secretHash" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "weight" INTEGER NOT NULL DEFAULT 10,
    "serveVideo" BOOLEAN NOT NULL DEFAULT true,
    "serveLive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "version" TEXT,
    "hostname" TEXT,
    "remoteIp" TEXT,
    "bytesServed" BIGINT NOT NULL DEFAULT 0,
    "requestsServed" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "edge_servers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "edge_servers_name_key" ON "edge_servers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "edge_servers_publicUrl_key" ON "edge_servers"("publicUrl");

