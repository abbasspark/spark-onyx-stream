-- AlterTable
ALTER TABLE "edge_traffic_hours" ADD COLUMN     "fetchedBytes" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "sharing_hours" (
    "hour" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "fromServers" BIGINT NOT NULL DEFAULT 0,
    "fromViewers" BIGINT NOT NULL DEFAULT 0,
    "toViewers" BIGINT NOT NULL DEFAULT 0,
    "reports" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sharing_hours_pkey" PRIMARY KEY ("hour","kind")
);

